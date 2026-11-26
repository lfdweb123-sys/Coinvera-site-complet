import { db } from '../firebase-admin';
import { HttpError } from '../auth';
import { postEntry, readBal, writeBal } from '../ledger';
import { fromUnits, toUnits } from '../money';
import { notify, merchantEmail } from '../audit';
import { error, info, warn } from '../log';
import { SITE } from '../site';
import { receiptFiatDeposit } from '../receipt-events';
import { sendMail } from '../brevo';
import { simpleEmail } from '../mail';
import { ALERT_TO } from '../cards/refill';
import { fiatSettings } from './settings';
import { effectiveRate, fmtLocal, gainEstimateUsd, quoteLocal } from './quote';
import { liveRate } from './rates';
import { METHODS, Method, methodById, methodView, needsPhone, normalizePhone } from './methods';
import { banks, bmoCancel, bmoConfirm, buildBody, feexConfigured, history, initiate, statusOf, Init } from './feexpay';
// Dépôts en mobile money / virement (FeexPay) pour les cartes virtuelles (scope « cards ») et les Virtuals cards pro (scope « scarab »), uniquement.
// Le montant crédité est exactement celui demandé, en dollars, sur le crédit réservé aux cartes (jamais retirable). Il sert ensuite à acheter une carte ou à la recharger.
// Collection fiat_orders ; la référence FeexPay est réservée une seule fois (fiat_refs) : un même paiement ne peut jamais créditer deux commandes.
export type Scope = 'cards' | 'scarab';
export const BUCKET: Record<Scope, string> = { cards: 'card_credit', scarab: 'scarab_credit' };
export const VALID_MS = 30 * 60_000, BMO_MS = 3 * 60_000, WATCH_MS = 24 * 3600_000, MAX_PENDING = 5;
const END = ['fulfilled', 'failed', 'rejected', 'closed', 'review', 'unknown'];
const ref = (id: string) => db.doc(`fiat_orders/${id}`);

export async function quoteFiat(methodId: string, amount: string) {
  const s = await fiatSettings(); if (!s.enabled) throw new HttpError(503, 'fiat_disabled'); if (!feexConfigured()) throw new HttpError(503, 'fiat_unavailable');
  const m = methodById(methodId); if (!m) throw new HttpError(400, 'invalid_method');
  const u = toUnits(amount); if (!(u >= s.depositMin * 1e6 && u <= s.depositMax * 1e6)) throw new HttpError(400, 'invalid_amount');
  const live = await liveRate(m.cur), rate = effectiveRate(live, s, m.cur), local = quoteLocal(u, rate, s, m.cur);
  if (local < m.min) throw new HttpError(400, 'amount_too_low'); if (local > m.max) throw new HttpError(400, 'amount_too_high');
  return { m, s, u, live, rate, local };
}
export async function listMethods() {
  const s = await fiatSettings(); if (!s.enabled || !feexConfigured()) return { enabled: false, methods: [] as ReturnType<typeof methodView>[], min: s.depositMin, max: s.depositMax };
  return { enabled: true, methods: METHODS.map(methodView), min: s.depositMin, max: s.depositMax };
}
export async function bankList() { return banks(); }

// Alerte e-mail à l'administrateur pour chaque dépôt mobile money / virement (crédité, ou à trancher). Ne bloque jamais l'opération.
async function alertAdmin(id: string, kind: 'credited' | 'review') {
  try {
    if (!process.env.BREVO_API_KEY) { warn('fiat.admin_alert_not_sent', { orderId: id }); return; }
    const o = (await ref(id).get()).data(); if (!o) return; const m = methodById(o.methodId);
    const who = (await merchantEmail(o.merchantId).catch(() => '')) || o.merchantId;
    const usdt = (o.creditUnits ?? 0) / 1e6, recv = (o.local * (1 - (o.feeBps ?? 0) / 10_000)) / (o.liveRate ?? o.rate);
    const rows: [string, string][] = [['Utilisateur', who], ['Service', o.scope === 'scarab' ? 'Virtuals cards pro' : 'Cartes virtuelles'], ['Moyen', `${m?.name ?? o.methodId} (${m?.country ?? o.cc})`], ['Montant payé', `${fmtLocal(o.local)} ${o.label}`],
      ['Crédit utilisateur', `${usdt.toFixed(2)} $ (= ${usdt.toFixed(2)} USDT)`], ['À convertir en USDT (estimation, après frais)', `${recv.toFixed(2)} USDT`], ['Gain estimé', `${gainEstimateUsd(o.local, o.liveRate ?? o.rate, o.feeBps ?? 0, o.creditUnits).toFixed(2)} $`], ['Référence', String(o.reference ?? '—')], ['Commande', id]];
    const subject = kind === 'review' ? 'Dépôt mobile money à vérifier' : `Dépôt mobile money : ${fmtLocal(o.local)} ${o.label}`;
    const html = simpleEmail({ title: subject, paragraphs: kind === 'review' ? ['FeexPay annonce un montant inférieur à celui facturé : rien n’a été crédité. Tranchez dans Admin > Paiements mobile money.'] : ['Un dépôt vient d’être crédité à un utilisateur. Les fonds sont sur votre compte FeexPay : pensez à les convertir en USDT pour alimenter le portefeuille des cartes.'], rows, note: 'Alerte automatique Coinvera.' });
    for (const to of ALERT_TO()) await sendMail(to, subject, html).catch(e => warn('fiat.admin_alert_failed', { message: (e as Error).message }));
  } catch (e) { warn('fiat.admin_alert_error', { orderId: id, message: (e as Error).message }); }
}

export const view = (id: string, o: Record<string, any>) => ({ id, status: o.status, scope: o.scope, method: o.methodId, methodName: methodById(o.methodId)?.name ?? o.methodId, flow: methodById(o.methodId)?.flow ?? 'push', label: o.label, local: o.local, localText: fmtLocal(o.local ?? 0), creditUsd: fromUnits(o.creditUnits ?? 0), usdt: fromUnits(o.creditUnits ?? 0), expiresAt: o.expiresAt, paymentUrl: o.paymentUrl ?? null, bank: o.bank ?? null, otp: o.status === 'otp', error: o.error ?? null });

async function mapRef(reference: string, orderId: string) {
  try { await db.doc(`fiat_refs/${reference.replace(/\//g, '_')}`).create({ orderId, createdAt: Date.now() }); }
  catch { const ex = (await db.doc(`fiat_refs/${reference.replace(/\//g, '_')}`).get()).data(); if (ex?.orderId !== orderId) throw new HttpError(409, 'reference_conflict'); }
}
const names = (merchant: Record<string, any>) => { const full = String(merchant?.fullName ?? merchant?.name ?? merchant?.displayName ?? '').trim().replace(/[^\p{L} '-]/gu, ''); const [f, ...r] = full.split(/\s+/); return { firstName: (f || 'Client').slice(0, 30), lastName: (r.join(' ') || 'Coinvera').slice(0, 30) }; };
const bodyFor = (m: Method, id: string, o: Record<string, any>, merchant: Record<string, any>, email: string | undefined, otp?: string) => {
  const n = names(merchant); const back = `${SITE}/dashboard/${o.scope === 'scarab' ? 'carte-pro' : 'cards'}?fiat=${id}`;
  return buildBody(m, { amount: o.local, phone: o.phone ?? undefined, firstName: m.names || m.flow === 'bmo' ? n.firstName : undefined, lastName: m.names || m.flow === 'bmo' ? n.lastName : undefined, email, description: 'Coinvera credit cartes', callbackInfo: id, returnUrl: back, cancelUrl: back, otp, bankCode: o.bankCode });
};

type U = { uid: string; email?: string; merchant: Record<string, any> };
export async function createFiatOrder(u: U, scope: Scope, methodId: string, amount: string, input: { phone?: string; otp?: string; bankCode?: string }) {
  const { m, s, u: units, live, rate, local } = await quoteFiat(methodId, amount);
  let phone: string | null = null;
  if (needsPhone(m)) { phone = normalizePhone(m, input.phone ?? ''); if (!phone) throw new HttpError(400, 'invalid_phone'); }
  if (m.flow === 'otp' && !/^\d{4,8}$/.test(input.otp ?? '')) throw new HttpError(400, 'otp_required');
  if (m.flow === 'bank_redirect') { const ok = (await banks()).some(b => b.code === input.bankCode); if (!ok) throw new HttpError(400, 'invalid_bank'); }
  const pending = (await db.collection('fiat_orders').where('merchantId', '==', u.uid).where('status', 'in', ['creating', 'awaiting', 'otp']).get()).docs.filter(d => (d.data().expiresAt ?? 0) > Date.now()).length;
  if (pending >= MAX_PENDING) throw new HttpError(429, 'too_many_pending');
  const id = db.collection('fiat_orders').doc().id, now = Date.now();
  const o: Record<string, any> = { merchantId: u.uid, scope, methodId: m.id, cc: m.cc, cur: m.cur, label: m.label, local, creditUnits: units, rate, liveRate: live, feeBps: s.feeBps, phone, bankCode: input.bankCode ?? null, status: 'creating', reference: null, createdAt: now, expiresAt: now + (m.flow === 'bmo' ? BMO_MS : VALID_MS) };
  await ref(id).set(o);
  let r: Init;
  try { r = await initiate(m, bodyFor(m, id, o, u.merchant, u.email, input.otp)); }
  catch (e) { const code = (e as HttpError).code ?? 'provider_unavailable'; await ref(id).update({ status: code === 'provider_unavailable' ? 'unknown' : 'failed', error: code === 'provider_unavailable' ? 'provider_timeout' : code }); throw e; }   // réponse perdue : la demande a peut-être abouti, le rapprochement avec l'historique tranche
  return applyInit(id, m, { ...o }, r);
}
// Résultat de la création (ou de l'étape 2 Coris) : enregistre la référence, l'étape suivante et, pour un virement, le compte temporaire.
async function applyInit(id: string, m: Method, o: Record<string, any>, r: Init) {
  if (!r.reference) { await ref(id).update({ status: 'failed', error: 'provider_error' }); error('fiat.no_reference', { orderId: id, method: m.id }); throw new HttpError(502, 'provider_error'); }
  if (r.status === 'FAILED') { await ref(id).update({ status: 'failed', error: 'payment_rejected', providerMessage: r.message }); return view(id, { ...o, status: 'failed', error: 'payment_rejected' }); }
  const patch: Record<string, any> = { reference: r.reference, providerStatus: r.status };
  if (m.flow === 'bank_transfer') {
    if (!r.bank || r.amountExpected == null) { await ref(id).update({ status: 'failed', error: 'provider_error' }); throw new HttpError(502, 'provider_error'); }
    if (r.amountExpected < o.local) { await ref(id).update({ status: 'failed', error: 'amount_mismatch', reference: r.reference }); error('fiat.amount_mismatch', { orderId: id, quoted: o.local, expected: r.amountExpected }); throw new HttpError(502, 'provider_error'); }
    patch.local = r.amountExpected; patch.bank = r.bank; const exp = r.bank.expiresAt ? Date.parse(r.bank.expiresAt) : NaN; if (Number.isFinite(exp) && exp > Date.now()) patch.expiresAt = exp;
  }
  if (r.paymentUrl) patch.paymentUrl = r.paymentUrl;
  const otpStage = (m.flow === 'coris' || m.flow === 'bmo') && !o.otpDone && r.status !== 'SUCCESSFUL';
  patch.status = otpStage ? 'otp' : 'awaiting'; if (!otpStage && o.otpDone) patch.expiresAt = Date.now() + VALID_MS;
  await mapRef(r.reference, id); await ref(id).update(patch);
  const next = { ...o, ...patch };
  if (r.status === 'SUCCESSFUL' && m.flow !== 'bmo') return checkFiatOrder(o.merchantId, id, { force: true });
  return view(id, next);
}

export async function confirmOtp(uid: string, id: string, otp: string, merchant: Record<string, any>, email?: string) {
  if (!/^\d{3,8}$/.test(otp)) throw new HttpError(400, 'invalid_otp');
  const o = (await ref(id).get()).data(); if (!o || o.merchantId !== uid) throw new HttpError(404, 'not_found'); const m = methodById(o.methodId);
  if (!m || o.status !== 'otp') throw new HttpError(409, 'not_awaiting_code'); if (o.expiresAt < Date.now()) { await expire(id, o); throw new HttpError(409, 'expired'); }
  if ((o.otpTries ?? 0) >= 3) { await ref(id).update({ status: 'failed', error: 'too_many_attempts' }); throw new HttpError(429, 'too_many_attempts'); }
  await ref(id).update({ otpTries: (o.otpTries ?? 0) + 1 });
  if (m.flow === 'bmo') {
    const r = await bmoConfirm(o.reference, otp);
    if (r.status === 'SUCCESSFUL') { await creditFiat(id, 'provider_confirm'); return view(id, (await ref(id).get()).data()!); }   // pas de webhook B-MO : la réponse de confirmation, reçue directement de FeexPay, fait foi
    if (r.status === 'FAILED') { await ref(id).update({ status: 'failed', error: 'invalid_otp' }); throw new HttpError(400, 'invalid_otp'); }
    await ref(id).update({ status: 'awaiting', expiresAt: Date.now() + VALID_MS }); return view(id, (await ref(id).get()).data()!);
  }
  if (m.flow === 'coris') {
    let r: Init; try { r = await initiate(m, bodyFor(m, id, o, merchant, email, otp)); } catch (e) { throw e; }
    return applyInit(id, m, { ...o, otpDone: true }, { ...r, reference: r.reference ?? o.reference });
  }
  throw new HttpError(409, 'not_awaiting_code');
}

async function expire(id: string, o: Record<string, any>) {
  if (o.methodId === 'bmo' && o.reference) await bmoCancel(o.reference).catch(() => {});
  await ref(id).update({ status: 'expired' });
}
// Crédite le crédit cartes (cards) ou le crédit Virtuals cards pro (scarab) du montant EXACT demandé. Une seule fois : transition de statut et écriture comptable dans la même transaction,
// identifiant d'écriture fixe (la création échoue si elle existe déjà).
export async function creditFiat(id: string, via: string) {
  let uid = '', amt = 0, scope = 'cards' as Scope;
  const ok = await db.runTransaction(async tx => {
    const o = (await tx.get(ref(id))).data(); if (!o || ['fulfilled', 'failed', 'rejected'].includes(o.status)) return false;
    uid = o.merchantId; amt = o.creditUnits as number; scope = o.scope; if (!Number.isInteger(amt) || amt <= 0) throw new Error('bad_credit');
    const bal = await readBal(tx, uid), b = BUCKET[scope as Scope];
    postEntry(tx, `fiat_deposit_${id}`, uid, 'fiat_deposit', [{ account: 'central:funds', dir: 'debit', amount: amt }, { account: `merchant:${uid}:${b}`, dir: 'credit', amount: amt }], { fiatOrderId: id, local: o.local, cur: o.cur, via });
    writeBal(tx, uid, { ...bal, [b]: (bal[b] ?? 0) + amt });
    tx.update(ref(id), { status: 'fulfilled', creditedUnits: amt, paidAt: Date.now(), via, gainUsd: Number(gainEstimateUsd(o.local, o.liveRate ?? o.rate, o.feeBps ?? 0, amt).toFixed(4)) }); return true;
  });
  if (ok) { info('fiat.credited', { orderId: id, merchantId: uid, scope, amount: amt, via }); await notify(uid, scope === 'scarab' ? 'Crédit Virtuals cards pro rechargé' : 'Crédit cartes rechargé', `${fromUnits(amt).replace(/0+$/, '').replace(/\.$/, '')} $ ajoutés : vous pouvez maintenant payer votre carte.`).catch(() => {}); await receiptFiatDeposit(id); await alertAdmin(id, 'credited'); }
  return ok;
}

export async function checkFiatOrder(uid: string | null, id: string, opt: { force?: boolean } = {}) {
  let o = (await ref(id).get()).data(); if (!o || (uid && o.merchantId !== uid)) throw new HttpError(404, 'not_found');
  if (END.includes(o.status)) return view(id, o);
  const now = Date.now();
  if (o.status === 'creating') { if (now - o.createdAt > 120_000) { await ref(id).update({ status: 'unknown', error: 'provider_timeout' }); warn('fiat.creating_timeout', { orderId: id }); return view(id, { ...o, status: 'unknown', error: 'provider_timeout' }); } return view(id, o); }
  if (o.status === 'otp') { if (o.expiresAt < now) { await expire(id, o); return view(id, { ...o, status: 'expired' }); } return view(id, o); }
  if (!opt.force && now - (o.checkedAt ?? 0) < 4000) return view(id, o);
  await ref(id).update({ checkedAt: now });
  let st; try { st = await statusOf(o.reference); } catch (e) { warn('fiat.status_failed', { orderId: id, message: (e as Error).message }); return view(id, o); }
  if (st.reference && st.reference !== o.reference) { error('fiat.reference_mismatch', { orderId: id }); return view(id, o); }
  if (st.status === 'SUCCESSFUL') {
    // Jamais de crédit si FeexPay annonce un montant inférieur à celui facturé : l'administrateur tranche.
    if (st.amount != null && st.amount < o.local) { await ref(id).update({ status: 'review', reviewReason: `montant annoncé ${st.amount} < ${o.local}` }); error('fiat.amount_below_quote', { orderId: id, got: st.amount, quoted: o.local }); await alertAdmin(id, 'review'); return view(id, { ...o, status: 'review' }); }
    await creditFiat(id, 'status'); return view(id, (await ref(id).get()).data()!);
  }
  if (st.status === 'FAILED') { await ref(id).update({ status: 'failed', error: 'payment_failed' }); return view(id, { ...o, status: 'failed', error: 'payment_failed' }); }
  if (o.status === 'awaiting' && o.expiresAt < now) { await ref(id).update({ status: 'expired' }); o = { ...o, status: 'expired' }; }   // un paiement tardif reste crédité (surveillance 24 h)
  if (o.status === 'expired' && o.createdAt + WATCH_MS < now) { await ref(id).update({ status: 'closed' }); o = { ...o, status: 'closed' }; }
  return view(id, o);
}
/** Signal du webhook : on retrouve la commande par la référence FeexPay, puis on RELIT le statut à la source. */
export async function onWebhook(reference: string) {
  const r = (await db.doc(`fiat_refs/${reference.replace(/\//g, '_')}`).get()).data(); if (!r?.orderId) { info('fiat.webhook_unknown_reference'); return false; }
  await checkFiatOrder(null, r.orderId, { force: true }); return true;
}
export async function resolveFiat(id: string, decision: 'credit' | 'reject') {
  const o = (await ref(id).get()).data(); if (!o || o.status !== 'review') throw new HttpError(409, 'not_in_review');
  if (decision === 'reject') { await ref(id).update({ status: 'rejected', resolvedAt: Date.now() }); return; }
  await creditFiat(id, 'admin');
}
export async function pollFiat() {
  let n = 0;
  for (const st of ['creating', 'awaiting', 'otp', 'expired']) for (const d of (await db.collection('fiat_orders').where('status', '==', st).limit(100).get()).docs) { try { await checkFiatOrder(null, d.id); n++; } catch (e) { warn('cron.fiat_item_failed', { id: d.id, message: (e as Error).message }); } }
  await reconcileFiat().catch(e => warn('cron.fiat_reconcile_failed', { message: (e as Error).message }));   // au plus toutes les 10 min
  return n;
}

// Rapprochement avec l'historique FeexPay (2 derniers jours, encaissements réussis) : aucun paiement réussi ne reste sans crédit, même si une réponse s'est perdue.
//  - commande « unknown » (création sans réponse, donc sans référence) : retrouvée par son identifiant (callback_info) et un montant au moins égal ; la référence est alors rattachée puis le statut relu à la source ;
//  - commande connue mais pas encore créditée : relue à la source.
export async function reconcileFiat(force = false) {
  const meta = db.doc('fiat_meta/reconcile'); const last = (await meta.get()).data()?.at ?? 0; if (!force && Date.now() - last < 10 * 60_000) return { skipped: true };
  await meta.set({ at: Date.now() });
  const day = (t: number) => new Date(t).toISOString().slice(0, 10); const rows = await history(day(Date.now() - 2 * 86400_000), day(Date.now() + 86400_000), 'SUCCESSFUL');
  let linked = 0, checked = 0;
  const unknown = (await db.collection('fiat_orders').where('status', '==', 'unknown').limit(200).get()).docs;
  for (const d of unknown) { const o = d.data();
    if (Date.now() - o.createdAt > WATCH_MS) { await ref(d.id).update({ status: 'failed', error: 'provider_timeout' }); continue; }
    const hit = rows.find(r => r.status === 'SUCCESSFUL' && (r.callbackId === d.id || r.customId === d.id) && (r.amount == null || r.amount >= o.local));
    if (!hit) continue;
    try { await mapRef(hit.reference, d.id); await ref(d.id).update({ reference: hit.reference, status: 'awaiting', error: null }); linked++; await checkFiatOrder(null, d.id, { force: true }); }
    catch (e) { warn('fiat.reconcile_link_failed', { orderId: d.id, message: (e as Error).message }); }
  }
  for (const r of rows) { const m = (await db.doc(`fiat_refs/${r.reference.replace(/\//g, '_')}`).get()).data(); if (!m?.orderId) continue;
    const o = (await ref(m.orderId).get()).data(); if (!o || ['fulfilled', 'failed', 'rejected', 'review'].includes(o.status)) continue;
    try { await checkFiatOrder(null, m.orderId, { force: true }); checked++; } catch (e) { warn('fiat.reconcile_check_failed', { orderId: m.orderId, message: (e as Error).message }); } }
  return { rows: rows.length, linked, checked };
}
