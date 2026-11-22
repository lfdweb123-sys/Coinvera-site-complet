import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../firebase-admin';
import { HttpError } from '../auth';
import { postEntry, readBal, writeBal } from '../ledger';
import { fromUnits, toUnits } from '../money';
import { notify } from '../audit';
import { info, warn } from '../log';
import { ci, CORE, isDefinitive, isRetryable } from './cryptoinfra';
import { cardSettings, markupOf } from './settings';
import { refillForOrder } from './refill';
import { getHolder, requireHolder } from './holder';
import { syncCards, ownedCard } from './cards';
import { assertCanIssue, assertCanTopup } from './catalog';
export type Spec = { kind: 'issue' | 'topup'; productCode?: string; cardId?: number; amount: string; nameOnCard?: string };
export type Priced = { chargeUnits: number; ciTotalUnits: number; markupUnits: number };
const acct = (uid: string, a: string) => `merchant:${uid}:${a}`;
// Prix fiable côté serveur (jamais celui envoyé par le navigateur) : total du prestataire + notre marge.
export async function quote(uid: string, spec: Spec) {
  const s = await cardSettings(); if (!s.enabled) throw new HttpError(503, 'cards_disabled');
  const h = await getHolder(uid); let q: any;
  if (spec.kind === 'issue') {
    if (!spec.productCode) throw new HttpError(400, 'invalid_request'); await assertCanIssue(uid, spec.productCode, spec.amount);
    q = (await ci('GET', '/v1/cards/issue-quote', { query: { product_code: spec.productCode, core_id: CORE(), initial_amount: spec.amount, user_id: h?.registered ? h.externalId : undefined } })).data;
  } else {
    if (!spec.cardId) throw new HttpError(400, 'invalid_request'); await assertCanTopup(uid, spec.cardId); const hh = await requireHolder(uid);
    q = (await ci('GET', '/v1/cards/topup-quote', { query: { amount: spec.amount, card_id: spec.cardId, user_id: hh.externalId } })).data;
  }
  const ciTotalUnits = toUnits(q.total), markupUnits = markupOf(s, spec.kind, toUnits(spec.amount));
  return { spec, ciTotalUnits, markupUnits, chargeUnits: ciTotalUnits + markupUnits, gas: q.gas ?? null, dynamic: q.dynamic ?? null } as Priced & { spec: Spec; gas: string | null; dynamic: boolean | null };
}
export const quoteView = (q: Awaited<ReturnType<typeof quote>>) => ({ kind: q.spec.kind, amount: q.spec.amount, fees: fromUnits(q.chargeUnits - toUnits(q.spec.amount)), total: fromUnits(q.chargeUnits), gas: q.gas, dynamic: q.dynamic });
export const orderView = (id: string, o: Record<string, any>) => ({ id, kind: o.kind, status: o.status, source: o.source, amount: fromUnits(o.amount ?? 0), total: fromUnits(o.chargeUnits ?? 0), error: o.error ?? null, cardId: o.ciCardId ?? o.cardId ?? null, createdAt: o.createdAtMs ?? null });

// 1) Réservation : les fonds de l'utilisateur sont mis de côté dans le registre AVANT l'appel au prestataire.
//    source=balance : prélevé sur le solde ; source=crypto : l'USDT reçu à l'adresse de paiement entre directement dans la réservation.
export async function placeOrder(uid: string, spec: Spec, pr: Priced, o: { source: 'balance' | 'crypto'; fixedId?: string; payOrderId?: string }) {
  const id = o.fixedId ?? db.collection('card_orders').doc().id; const ref = db.doc(`card_orders/${id}`); const charge = pr.chargeUnits;
  if (spec.kind === 'issue' && !spec.productCode) throw new HttpError(400, 'invalid_request');
  if (spec.kind === 'topup') await ownedCard(uid, spec.cardId!);
  const created = await db.runTransaction(async tx => {
    if ((await tx.get(ref)).exists) return false;
    const bal = await readBal(tx, uid); const fromBal = o.source === 'balance';
    // Le crédit cartes (dépôts USDT, non retirable) est dépensé en premier, puis le solde Coinvera.
    const creditPart = fromBal ? Math.min(bal.card_credit ?? 0, charge) : 0, availPart = fromBal ? charge - creditPart : 0;
    if (availPart > bal.available) throw new HttpError(409, 'insufficient_balance');
    const lines: any[] = [];
    if (creditPart) lines.push({ account: acct(uid, 'card_credit'), dir: 'debit', amount: creditPart });
    if (availPart) lines.push({ account: acct(uid, 'available'), dir: 'debit', amount: availPart });
    if (!fromBal) lines.push({ account: 'central:funds', dir: 'debit', amount: charge });
    lines.push({ account: acct(uid, 'card_reserved'), dir: 'credit', amount: charge });
    postEntry(tx, `card_reserve_${id}`, uid, 'card_reserve', lines, { orderId: id });
    writeBal(tx, uid, { ...bal, available: bal.available - availPart, card_credit: (bal.card_credit ?? 0) - creditPart, card_reserved: (bal.card_reserved ?? 0) + charge });
    tx.create(ref, { merchantId: uid, kind: spec.kind, source: o.source, payOrderId: o.payOrderId ?? null, productCode: spec.productCode ?? null, coreId: CORE(), cardId: spec.cardId ?? null, amount: toUnits(spec.amount), amountStr: Number(spec.amount).toFixed(2), nameOnCard: spec.nameOnCard ?? null,
      chargeUnits: charge, creditPart, availPart, ciTotalUnits: pr.ciTotalUnits, markupUnits: pr.markupUnits, status: 'reserved', createdAt: FieldValue.serverTimestamp(), createdAtMs: Date.now() });
    return true;
  });
  if (created) info('cards.order_reserved', { orderId: id, merchantId: uid, kind: spec.kind, source: o.source, charge });
  if (created || (await ref.get()).data()?.status === 'reserved') await dispatch(id);
  return id;
}

// 2) Envoi au prestataire. La clé d'idempotence est dérivée de l'ordre : un rejeu (timeout, cron) ne peut jamais créer deux cartes ni deux recharges.
export async function dispatch(id: string) {
  const ref = db.doc(`card_orders/${id}`); const o = (await ref.get()).data(); if (!o || !(o.status === 'reserved' || (o.status === 'processing' && !o.ciOrderId))) return;
  const h = await requireHolder(o.merchantId); const key = `cv-card-${id}`;
  try {
    if (o.kind === 'issue') {
      const r = await ci('POST', '/v1/cards', { body: { user_id: h.externalId, core_id: o.coreId, product_code: o.productCode, initial_amount: o.amountStr, idempotency_key: key, ...(o.nameOnCard ? { name_on_card: o.nameOnCard } : {}) } });
      await ref.update({ status: 'processing', ciOrderId: r.data.order?.id ?? null, ciStatus: r.data.order?.status ?? null, ciCardId: r.data.card?.id ?? null, updatedAt: Date.now() });
      if (r.data.card) await syncCards(o.merchantId).catch(() => {});
    } else {
      const r = await ci('POST', `/v1/cards/${o.cardId}/topup`, { body: { user_id: h.externalId, amount: o.amountStr, idempotency_key: key } });
      await ref.update({ status: 'processing', ciOrderId: r.data.id ?? null, ciStatus: r.data.status ?? null, updatedAt: Date.now() });
    }
  } catch (e) {
    if ((e as HttpError).code === 'rail_unfunded') await refillForOrder(id, o.ciTotalUnits).catch(x => warn('cards.refill_failed', { orderId: id, message: (x as Error).message }));   // portefeuille du programme vide : alimentation automatique depuis Bybit
    if (isRetryable(e) && Date.now() - (o.createdAtMs ?? 0) < ((e as HttpError).code === 'rail_unfunded' ? 45 : 15) * 60_000) { warn('cards.dispatch_retry', { orderId: id, code: (e as HttpError).code }); return; }   // le cron rejoue (même clé) pendant 15 min, puis l'ordre est remboursé
    if (isDefinitive(e)) { await finalize(id, false, { error: (e as HttpError).code }); throw e; }   // refus net : rien n'a été débité chez eux, on libère
    warn('cards.dispatch_unknown', { orderId: id, message: (e as Error).message });                  // état inconnu : on GARDE la réservation, le cron rejoue avec la même clé
  }
}

// 3) Règlement : fonds définitivement dépensés (succès) ou rendus au solde (échec). Idempotent.
export async function finalize(id: string, ok: boolean, info_: { total?: string; error?: string; cardId?: number | null }) {
  const ref = db.doc(`card_orders/${id}`); let uid = '', kind = '';
  const done = await db.runTransaction(async tx => {
    const o = (await tx.get(ref)).data(); if (!o || o.status === 'confirmed' || o.status === 'failed') return false;
    const cardId = info_.cardId ?? o.ciCardId ?? o.cardId ?? null; const cref = ok && cardId ? db.doc(`card_items/${cardId}`) : null; const c = cref ? (await tx.get(cref)).data() : null;
    const bal = await readBal(tx, o.merchantId); const charge = o.chargeUnits as number; uid = o.merchantId; kind = o.kind;
    const fromCredit = o.source === 'crypto' ? charge : (o.creditPart ?? 0);   // part de la charge issue du crédit cartes (non retirable)
    if (ok) {
      const cost = Math.min(charge, info_.total ? toUnits(info_.total) : o.ciTotalUnits);   // coût réel du prestataire ; l'écart avec ce qui a été facturé est notre marge
      const lines: any[] = [{ account: acct(uid, 'card_reserved'), dir: 'debit', amount: charge }, { account: 'central:funds', dir: 'credit', amount: cost }];
      if (charge - cost > 0) lines.push({ account: 'platform:revenue', dir: 'credit', amount: charge - cost });
      postEntry(tx, `card_done_${id}`, uid, 'card_done', lines, { orderId: id });
      writeBal(tx, uid, { ...bal, card_reserved: (bal.card_reserved ?? 0) - charge, card_spent: (bal.card_spent ?? 0) + charge });
      // Suivi de l'origine des fonds de chaque carte : à la fermeture, le remboursement revient dans les mêmes proportions (crédit cartes / solde retirable).
      if (cref) tx.set(cref, { merchantId: uid, fundedTotal: (c?.fundedTotal ?? 0) + charge, fundedFromCredit: (c?.fundedFromCredit ?? 0) + fromCredit }, { merge: true });
      tx.update(ref, { status: 'confirmed', costUnits: cost, ...(cardId ? { ciCardId: cardId } : {}), updatedAt: Date.now() });
    } else {
      // Échec définitif : chaque part revient là où elle a été prise ; un paiement USDT direct revient en crédit cartes.
      const back = o.source === 'crypto' ? { credit: charge, avail: 0 } : { credit: o.creditPart ?? 0, avail: o.availPart ?? charge };
      const lines: any[] = [{ account: acct(uid, 'card_reserved'), dir: 'debit', amount: charge }];
      if (back.credit) lines.push({ account: acct(uid, 'card_credit'), dir: 'credit', amount: back.credit });
      if (back.avail) lines.push({ account: acct(uid, 'available'), dir: 'credit', amount: back.avail });
      postEntry(tx, `card_release_${id}`, uid, 'card_release', lines, { orderId: id });
      writeBal(tx, uid, { ...bal, available: bal.available + back.avail, card_credit: (bal.card_credit ?? 0) + back.credit, card_reserved: (bal.card_reserved ?? 0) - charge });
      tx.update(ref, { status: 'failed', error: info_.error ?? 'failed', updatedAt: Date.now() });
    }
    return true;
  });
  if (!done) return false;
  info('cards.order_final', { orderId: id, ok, error: info_.error });
  if (ok) { if (kind === 'issue') await syncCards(uid).catch(() => {}); await notify(uid, kind === 'issue' ? 'Carte virtuelle prête' : 'Carte rechargée', 'Votre opération a été confirmée.'); }
  else await notify(uid, 'Opération carte échouée', 'Les fonds ont été remis sur votre solde ou votre crédit cartes.');
  return true;
}

// 4) Rapprochement : le prestataire est la source de vérité (les webhooks ne sont que des signaux).
export async function reconcile(id: string) {
  const ref = db.doc(`card_orders/${id}`); let o = (await ref.get()).data(); if (!o) return null; const age = Date.now() - (o.createdAtMs ?? 0);
  if (o.status === 'reserved' && age > 60_000) await dispatch(id).catch(() => {});
  else if (o.status === 'processing' && !o.ciOrderId && age > 120_000) await dispatch(id).catch(() => {});   // rejeu idempotent : récupère l'ordre déjà créé chez le prestataire
  else if (o.status === 'processing' && o.ciOrderId) {
    const r = (await ci('GET', `/v1/cards/orders/${o.ciOrderId}`)).data;
    if (r.status === 'confirmed') await finalize(id, true, { total: r.total, cardId: r.card_id ?? null });
    else if (r.status === 'failed' || r.status === 'reversed') await finalize(id, false, { error: r.provider_status ?? r.error ?? 'failed' });
    else if (r.status !== o.ciStatus) await ref.update({ ciStatus: r.status, ...(r.card_id ? { ciCardId: r.card_id } : {}) });
  }
  o = (await ref.get()).data(); return o ?? null;
}
export async function reconcileByCiOrder(ciOrderId: number) {
  const q = await db.collection('card_orders').where('ciOrderId', '==', ciOrderId).limit(1).get();
  if (!q.empty) await reconcile(q.docs[0].id);
}
