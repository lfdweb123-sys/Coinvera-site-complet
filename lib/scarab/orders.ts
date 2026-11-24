import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../firebase-admin';
import { HttpError } from '../auth';
import { postEntry, readBal, writeBal } from '../ledger';
import { fromUnits } from '../money';
import { notify } from '../audit';
import { error as logError, info, warn } from '../log';
import { sp, outcomeOf, publicCode, SpError } from './client';
import { scarabSettings, pricingOf } from './settings';
import { categoryOf, customerFee, liveCost, centsToUnits, centsToUsd, Kind } from './pricing';
import { productOf, wallet, needsCustomer } from './catalog';
import { requireApprovedCustomer } from './customers';
import { ensureScarabFunds } from './refill';
import { receiptScarabOrder } from '../receipt-events';
import { ownedCard, saveCard, cardRef, cardPatch, liveCount, refreshCard } from './cards';

export type Spec = { kind: Kind; productId?: string; cardId?: string; amount: string; nameOnCard?: string };
export type Quote = Awaited<ReturnType<typeof quote>>;
export const NAME_ON_CARD = /^[A-Za-z][A-Za-z .'-]{1,49}$/;
const acct = (uid: string, a: string) => `merchant:${uid}:${a}`;
const REVIEW_AFTER_UNKNOWN = 20 * 3600_000;   // la clé d'idempotence n'est retenue que 24 h : on ne rejoue plus après 20 h, un humain tranche
const GIVE_UP_RETRY = 2 * 3600_000;            // pause du réseau de cartes ou service indisponible depuis 2 h : rien n'a été débité chez eux, on rend les fonds

// ---- Devis : prix FIABLE calculé côté serveur (jamais celui du navigateur) -----------------------------------------------------
export async function quote(uid: string, spec: Spec) {
  const s = await scarabSettings(); if (!s.enabled) throw new HttpError(503, 'scarab_disabled');
  const w = await wallet(); const amountMinor = Math.round(Number(spec.amount) * 100);
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) throw new HttpError(400, 'invalid_amount');
  if (spec.nameOnCard && !NAME_ON_CARD.test(spec.nameOnCard)) throw new HttpError(400, 'name_required');
  let product: any, customerId: string | null = null;
  if (spec.kind === 'issue') {
    if (!spec.productId) throw new HttpError(400, 'invalid_request');
    product = await productOf(spec.productId); if ((s.hidden ?? []).includes(product.id)) throw new HttpError(404, 'product_not_found');
    if (needsCustomer(w)) { customerId = (await requireApprovedCustomer(uid)).customerId; if ((await liveCount(uid)) >= 3) throw new HttpError(409, 'scarab_customer_limit'); }
    else if (!spec.nameOnCard) throw new HttpError(400, 'name_required');
    if (amountMinor < Number(product.min_initial_load_minor ?? 0) || (Number(product.max_initial_load_minor ?? 0) > 0 && amountMinor > Number(product.max_initial_load_minor))) throw new HttpError(400, 'invalid_amount');
  } else {
    if (!spec.cardId) throw new HttpError(400, 'invalid_request');
    const c = await ownedCard(uid, spec.cardId); if (!['active', 'frozen'].includes(c.status)) throw new HttpError(409, 'card_state');
    product = await productOf(c.productId);
    if (amountMinor < Math.max(200, Number(product.min_recharge_minor ?? 0)) || (Number(product.max_recharge_minor ?? 0) > 0 && amountMinor > Number(product.max_recharge_minor))) throw new HttpError(400, 'invalid_amount');
    const maxBal = Number(product.max_balance_minor ?? 0);
    if (maxBal > 0) { const live = await refreshCard(uid, spec.cardId); if (Number(live?.balance_minor ?? 0) + amountMinor > maxBal) throw new HttpError(400, 'invalid_amount'); }
  }
  const feeMinor = customerFee(spec.kind, categoryOf(product.name ?? ''), amountMinor, pricingOf(s)[spec.kind]);
  let costFeeMinor: number; try { costFeeMinor = liveCost(spec.kind, product.fees, amountMinor); } catch { logError('scarab.fees_unreadable', { productId: product.id }); throw new HttpError(503, 'scarab_price_below_cost'); }
  // Garde-fou : on ne vend jamais à perte, quel que soit le plan ScarabPay.
  if (feeMinor < costFeeMinor) { logError('scarab.price_below_cost', { productId: product.id, kind: spec.kind, feeMinor, costFeeMinor }); throw new HttpError(503, 'scarab_price_below_cost'); }
  // Le portefeuille du programme paie la carte : trop bas, on le dit avant de débiter l'utilisateur.
  if (w.availableMinor < amountMinor + costFeeMinor) { warn('scarab.wallet_low', { availableMinor: w.availableMinor, needed: amountMinor + costFeeMinor }); void ensureScarabFunds((amountMinor + costFeeMinor) / 100).catch(() => {}); throw new HttpError(503, 'scarab_unavailable'); }
  return { spec, productName: String(product.name ?? ''), amountMinor, feeMinor, costFeeMinor, customerId, chargeUnits: centsToUnits(amountMinor + feeMinor) };
}
export const quoteView = (q: Quote) => ({ kind: q.spec.kind, amount: centsToUsd(q.amountMinor), fees: centsToUsd(q.feeMinor), total: centsToUsd(q.amountMinor + q.feeMinor) });
export const orderView = (id: string, o: Record<string, any>) => ({ id, kind: o.kind, status: o.status === 'review' ? 'processing' : o.status, source: o.source, amount: centsToUsd(o.amountMinor ?? 0), total: fromUnits(o.chargeUnits ?? 0), error: o.error ?? null, cardId: o.spCardId ?? null, createdAt: o.createdAtMs ?? null });

// Corps JSON sérialisé UNE fois et conservé : chaque rejeu (timeout, cron) renvoie exactement les mêmes octets, condition de la clé d'idempotence.
function payloadOf(spec: Spec, q: Quote) {
  if (spec.kind === 'topup') return JSON.stringify({ amount_minor: q.amountMinor });
  const b: Record<string, unknown> = { product_id: spec.productId }; if (q.customerId) b.customer_id = q.customerId; if (spec.nameOnCard) b.name_on_card = spec.nameOnCard; b.amount_minor = q.amountMinor; return JSON.stringify(b);
}
async function setIf(ref: FirebaseFirestore.DocumentReference, from: string[], patch: Record<string, unknown>) {
  await db.runTransaction(async tx => { const s = (await tx.get(ref)).data(); if (!s || !from.includes(s.status)) return; tx.update(ref, patch); });
}

// 1) Réservation : les fonds de l'utilisateur sont mis de côté dans le registre AVANT l'appel au prestataire.
//    source=balance : prélevé sur le solde Coinvera ; source=crypto : l'USDT reçu à l'adresse de paiement entre directement dans la réservation.
export async function placeOrder(uid: string, spec: Spec, q: Quote, o: { source: 'balance' | 'crypto'; fixedId?: string; payOrderId?: string }) {
  const id = o.fixedId ?? db.collection('scarab_orders').doc().id; const ref = db.doc(`scarab_orders/${id}`); const charge = q.chargeUnits;
  if (spec.kind === 'topup') await ownedCard(uid, spec.cardId!);
  const created = await db.runTransaction(async tx => {
    if ((await tx.get(ref)).exists) return false;
    const bal = await readBal(tx, uid); const fromBal = o.source === 'balance';
    // Le crédit Virtuals cards pro (dépôts, non retirable) est consommé en premier ; le reste vient du solde Coinvera.
    const creditPart = fromBal ? Math.min(Math.max(0, bal.scarab_credit ?? 0), charge) : 0, availPart = fromBal ? charge - creditPart : 0;
    if (fromBal && bal.available < availPart) throw new HttpError(409, 'insufficient_balance');
    const debit: any[] = fromBal ? [...(creditPart ? [{ account: acct(uid, 'scarab_credit'), dir: 'debit', amount: creditPart }] : []), ...(availPart ? [{ account: acct(uid, 'available'), dir: 'debit', amount: availPart }] : [])] : [{ account: 'central:funds', dir: 'debit', amount: charge }];
    postEntry(tx, `scarab_reserve_${id}`, uid, 'scarab_reserve', [...debit, { account: acct(uid, 'scarab_reserved'), dir: 'credit', amount: charge }], { orderId: id });
    writeBal(tx, uid, { ...bal, available: bal.available - availPart, scarab_credit: (bal.scarab_credit ?? 0) - creditPart, scarab_reserved: (bal.scarab_reserved ?? 0) + charge });
    tx.create(ref, { merchantId: uid, kind: spec.kind, source: o.source, payOrderId: o.payOrderId ?? null, productId: spec.productId ?? null, customerId: q.customerId, spCardId: spec.cardId ?? null, nameOnCard: spec.nameOnCard ?? null,
      amountMinor: q.amountMinor, feeMinor: q.feeMinor, costFeeMinor: q.costFeeMinor, chargeUnits: charge, creditPart, availPart, payloadJson: payloadOf(spec, q), status: 'reserved', attempts: 0, createdAt: FieldValue.serverTimestamp(), createdAtMs: Date.now() });
    return true;
  });
  if (created) info('scarab.order_reserved', { orderId: id, merchantId: uid, kind: spec.kind, source: o.source, charge });
  if (created || (await ref.get()).data()?.status === 'reserved') await dispatch(id);
  return id;
}

// 2) Envoi. La clé d'idempotence est dérivée de l'ordre : un rejeu ne peut jamais créer deux cartes ni deux recharges.
export async function dispatch(id: string) {
  const ref = db.doc(`scarab_orders/${id}`); const o = (await ref.get()).data(); if (!o || !['reserved', 'processing'].includes(o.status)) return;
  if (o.nextAttemptAt && o.nextAttemptAt > Date.now()) return;
  await ref.update({ attempts: (o.attempts ?? 0) + 1, lastAttemptAt: Date.now() });
  try {
    const r = await sp('POST', o.kind === 'issue' ? '/cards' : `/cards/${o.spCardId}/recharge`, { bodyRaw: o.payloadJson, idem: `cv-sp-${id}` });
    await onResponse(id, o, r);
  } catch (e) {
    const out = outcomeOf(e);
    if (out === 'definitive') { await finalize(id, false, { error: publicCode(e) }); throw new HttpError(409, publicCode(e)); }
    const wait = e instanceof SpError && e.retryAfter > 0 ? Math.min(e.retryAfter, 600) * 1000 : out === 'retry' ? 90_000 : 60_000;
    warn('scarab.dispatch_pending', { orderId: id, outcome: out, code: (e as HttpError).code });   // gardé : le cron rejoue avec la même clé
    await ref.update({ nextAttemptAt: Date.now() + wait, lastOutcome: out, lastError: (e as HttpError).code ?? 'error', ...(out === 'unknown' && !o.unknownAt ? { unknownAt: Date.now() } : {}) });
  }
}
async function onResponse(id: string, o: Record<string, any>, r: { status: number; data: any }) {
  const ref = db.doc(`scarab_orders/${id}`), d = r.data ?? {};
  if (o.kind === 'issue') {
    const cid: string | undefined = d.id; if (cid) await saveCard(o.merchantId, d);
    await setIf(ref, ['reserved', 'processing'], { status: 'processing', ...(cid ? { spCardId: cid } : {}), spStatus: d.status ?? 'pending', nextAttemptAt: null, lastOutcome: null, updatedAt: Date.now() });
    if (cid && d.status === 'active') await finalize(id, true, {});                                  // 201 : la carte existe et est active
    else if (cid && d.status === 'failed') await finalize(id, false, { error: 'provider_rejected' });
  } else if (r.status === 200 && d.id) { await cardRef(d.id).set(cardPatch(d), { merge: true }); await finalize(id, true, {}); }
  else await setIf(ref, ['reserved'], { status: 'processing', nextAttemptAt: null, lastOutcome: null, updatedAt: Date.now() });   // 202 : issue en cours, on attend le webhook ou le rapprochement
}

// 3) Règlement : fonds définitivement dépensés (succès) ou rendus au solde (échec). Idempotent.
export async function finalize(id: string, ok: boolean, f: { error?: string; feeMinor?: number }) {
  const ref = db.doc(`scarab_orders/${id}`); let uid = '', kind = '';
  const done = await db.runTransaction(async tx => {
    const o = (await tx.get(ref)).data(); if (!o || o.status === 'confirmed' || o.status === 'failed') return false;
    const bal = await readBal(tx, o.merchantId); const charge = o.chargeUnits as number; uid = o.merchantId; kind = o.kind;
    if (ok) {
      // Coût réel : montant + frais du plan (frais exacts quand le webhook les donne, sinon relevé au devis). L'écart avec ce qui a été facturé est ta marge.
      const cost = Math.min(charge, centsToUnits(o.amountMinor + (f.feeMinor ?? o.costFeeMinor)));
      const lines: any[] = [{ account: acct(uid, 'scarab_reserved'), dir: 'debit', amount: charge }, { account: 'central:funds', dir: 'credit', amount: cost }];
      if (charge - cost > 0) lines.push({ account: 'platform:revenue', dir: 'credit', amount: charge - cost });
      postEntry(tx, `scarab_done_${id}`, uid, 'scarab_done', lines, { orderId: id });
      writeBal(tx, uid, { ...bal, scarab_reserved: (bal.scarab_reserved ?? 0) - charge, scarab_spent: (bal.scarab_spent ?? 0) + charge });
      tx.update(ref, { status: 'confirmed', costUnits: cost, updatedAt: Date.now() });
    } else {
      // Chaque part retourne là où elle a été prise (les anciens ordres, sans parts, reviennent entièrement au solde).
      const backCredit = (o.creditPart as number | undefined) ?? 0, backAvail = charge - backCredit;
      postEntry(tx, `scarab_release_${id}`, uid, 'scarab_release', [{ account: acct(uid, 'scarab_reserved'), dir: 'debit', amount: charge }, ...(backAvail ? [{ account: acct(uid, 'available'), dir: 'credit' as const, amount: backAvail }] : []), ...(backCredit ? [{ account: acct(uid, 'scarab_credit'), dir: 'credit' as const, amount: backCredit }] : [])], { orderId: id });
      writeBal(tx, uid, { ...bal, available: bal.available + backAvail, scarab_credit: (bal.scarab_credit ?? 0) + backCredit, scarab_reserved: (bal.scarab_reserved ?? 0) - charge });
      tx.update(ref, { status: 'failed', error: f.error ?? 'failed', updatedAt: Date.now() });
    }
    return true;
  });
  if (!done) return false;
  info('scarab.order_final', { orderId: id, ok, error: f.error });
  if (ok) { await notify(uid, kind === 'issue' ? 'Virtuals cards pro prête' : 'Virtuals cards pro rechargée', 'Votre opération a été confirmée.'); await receiptScarabOrder(id); }
  else await notify(uid, 'Opération Virtuals cards pro échouée', 'Les fonds ont été remis sur votre solde.');
  return true;
}
async function toReview(id: string, reason: string) {
  await setIf(db.doc(`scarab_orders/${id}`), ['reserved', 'processing'], { status: 'review', reviewReason: reason, updatedAt: Date.now() });
  logError('scarab.order_needs_review', { orderId: id, reason });
}

// 4) Rapprochement : le prestataire est la source de vérité (les webhooks ne sont que des signaux).
export async function reconcile(id: string) {
  const ref = db.doc(`scarab_orders/${id}`); let o = (await ref.get()).data(); if (!o) return null;
  const age = Date.now() - (o.createdAtMs ?? 0);
  if (o.status === 'reserved') {
    if (o.lastOutcome === 'retry' && age > GIVE_UP_RETRY) await finalize(id, false, { error: 'scarab_unavailable' });
    else if (o.unknownAt && Date.now() - o.unknownAt > REVIEW_AFTER_UNKNOWN) await toReview(id, 'unknown_outcome_too_long');
    else if (age > 30_000) await dispatch(id).catch(() => {});
  } else if (o.status === 'processing') {
    if (o.kind === 'issue' && o.spCardId) {
      const c = await refreshCard(o.merchantId, o.spCardId).catch(() => null);
      if (c?.status === 'active') await finalize(id, true, {}); else if (c?.status === 'failed') await finalize(id, false, { error: 'provider_rejected' }); else if (c && ['terminated', 'expired'].includes(c.status)) await toReview(id, 'card_closed_before_active');
    } else await dispatch(id).catch(() => {});   // pas d'identifiant de carte, ou recharge en attente : rejeu de la MÊME clé = état courant, sans rien relancer
    if (age > 3 * 3600_000) await toReview(id, 'processing_too_long');
  }
  o = (await ref.get()).data(); return o ?? null;
}
// Ordres encore ouverts pour une carte (les webhooks ne donnent que l'identifiant de la carte).
export async function openOrdersForCard(cardId: string, kind: Kind) {
  return (await db.collection('scarab_orders').where('spCardId', '==', cardId).get()).docs.filter(d => d.data().kind === kind && ['reserved', 'processing', 'review'].includes(d.data().status)).sort((a, b) => (a.data().createdAtMs ?? 0) - (b.data().createdAtMs ?? 0));
}
export async function reconcileOpenIssues() {
  const q = await db.collection('scarab_orders').where('status', 'in', ['reserved', 'processing']).limit(50).get();
  for (const d of q.docs) if (d.data().kind === 'issue') await reconcile(d.id).catch(() => {});
}
// Décision manuelle de l'administrateur sur un ordre bloqué (status review).
export async function resolveOrder(id: string, action: 'confirm' | 'refund') { return finalize(id, action === 'confirm', action === 'refund' ? { error: 'manual_refund' } : {}); }
