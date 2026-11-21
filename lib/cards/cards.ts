import { db } from '../firebase-admin';
import { HttpError } from '../auth';
import { postEntry, readBal, writeBal } from '../ledger';
import { toUnits } from '../money';
import { notify } from '../audit';
import { info } from '../log';
import { cardSettings } from './settings';
import { ci } from './cryptoinfra';
import { getHolder, requireHolder } from './holder';
// Cartes d'un utilisateur : le prestataire reste la source de vérité, `card_items` ne sert qu'à vérifier à qui appartient chaque carte.
export async function syncCards(uid: string) {
  const h = await getHolder(uid); if (!h?.registered) return [];
  let list: any[] = [];
  try { list = (await ci('GET', '/v1/cards', { query: { user_id: h.externalId } })).data.cards ?? []; }
  catch (e) { if ((e as HttpError).status === 404) return []; throw e; }
  if (list.length) {
    const b = db.batch();
    for (const c of list) b.set(db.doc(`card_items/${c.id}`), { merchantId: uid, ciCardId: c.id, last4: c.last4 ?? null, status: c.status_normalized, productCode: c.product_code ?? null, coreId: c.core_id ?? null, bin: c.bin ?? null, nameOnCard: c.name_on_card ?? null, issuedAt: c.issued_at ?? null, updatedAt: Date.now() }, { merge: true });
    await b.commit();
  }
  return list;
}
// Toute action sur une carte passe par ici : la clé API du prestataire opère sur TOUTES les cartes, c'est nous qui garantissons la propriété.
export async function ownedCard(uid: string, id: number) {
  let s = await db.doc(`card_items/${id}`).get();
  if (!s.exists || s.data()!.merchantId !== uid) { await syncCards(uid); s = await db.doc(`card_items/${id}`).get(); }
  if (!s.exists || s.data()!.merchantId !== uid) throw new HttpError(404, 'card_not_found');
  return s.data() as Record<string, any>;
}
export async function cardDetails(uid: string, id: number) {
  await ownedCard(uid, id); const h = await requireHolder(uid);
  const d = (await ci('GET', `/v1/cards/${id}`, { query: { user_id: h.externalId } })).data;
  const status = d.card?.status_normalized; if (status) await db.doc(`card_items/${id}`).set({ status, updatedAt: Date.now() }, { merge: true });
  return { id, last4: d.card?.last4 ?? null, status, nameOnCard: d.name_on_card ?? d.card?.name_on_card ?? null, expire: d.expire_date ?? null, balance: d.balance?.available ?? null, pending: d.balance?.pending ?? null,
    closeInProgress: !!d.close_in_progress, closeRefund: d.close_refund ? { state: d.close_refund.state, amount: d.close_refund.amount ?? null } : null, otpAvailable: !!d.otp_available, otp: d.otp_waiting ?? null, readFailed: !!d.provider_read_failed };
}
export async function closeQuote(uid: string, id: number) {
  await ownedCard(uid, id); const h = await requireHolder(uid);
  const q = (await ci('GET', `/v1/cards/${id}/close-quote`, { query: { user_id: h.externalId } })).data; const r = q.refund_quote ?? {};
  return { live: !!r.live, cardBalance: r.card_balance ?? null, issuerFee: r.issuer_fee ?? null, railFee: r.rail_return_fee ?? null, closeFee: r.close_fee ?? null, gas: r.gas ?? null, refund: r.refund ?? null, etaTypical: q.refund_eta_typical ?? null, etaMaxDays: q.refund_eta_max_days ?? null, etaWorkingDays: q.refund_eta_working_days ?? null, advance: (await cardSettings()).refundAdvance };
}
export async function closeCard(uid: string, id: number) {
  await ownedCard(uid, id); const h = await requireHolder(uid);
  // Estimation lue AVANT la fermeture (la carte ne sera plus lisible ensuite) : elle sert à créditer l'utilisateur dès que la carte est réellement fermée.
  let estimate = 0; try { const q = await closeQuote(uid, id); if (q.live && q.refund != null) estimate = Math.max(0, toUnits(q.refund)); } catch { /* sans estimation : crédit à l'arrivée du remboursement réel */ }
  const r = await ci('DELETE', `/v1/cards/${id}`, { body: { user_id: h.externalId } });
  await db.doc(`card_items/${id}`).set({ closeRequestedAt: Date.now(), refundEstimateUnits: estimate, updatedAt: Date.now() }, { merge: true });
  await checkClose(uid, id).catch(() => {});
  return { state: r.status === 202 ? 'in_progress' : 'closed' };
}
// Proportion du solde de la carte venue du crédit cartes (non retirable) : le remboursement y revient dans la même proportion.
const split = (c: Record<string, any>, x: number) => { const r = c.fundedTotal > 0 ? Math.min(1, (c.fundedFromCredit ?? 0) / c.fundedTotal) : 0; const credit = Math.round(x * r); return { credit, avail: x - credit }; };
// Règlement d'une carte fermée, en deux temps :
//  1) AVANCE : dès que la carte est réellement fermée (son solde n'est plus dépensable) on crédite l'estimation fiable lue avant la fermeture,
//     plafonnée à ce qui a été chargé sur la carte. Désactivable dans l'admin (refundAdvance).
//  2) RÈGLEMENT : quand CryptoInfra confirme le remboursement (close_refund.state = paid), on solde l'écart : complément si le montant réel est plus élevé,
//     perte enregistrée (jamais reprise à l'utilisateur) s'il est plus bas. Sans avance, le montant réel est crédité à ce moment.
export async function checkClose(uid: string, id: number) {
  const ref = db.doc(`card_items/${id}`); const c0 = (await ref.get()).data();
  if (!c0 || c0.merchantId !== uid || !c0.closeRequestedAt || c0.settled) return false;
  const h = await requireHolder(uid); const d = (await ci('GET', `/v1/cards/${id}`, { query: { user_id: h.externalId } })).data;
  const status = d.card?.status_normalized as string | undefined; const cr = d.close_refund; const state = String(cr?.state ?? '').toLowerCase();
  await ref.set({ ...(status ? { status } : {}), refundState: state || null, updatedAt: Date.now() }, { merge: true });
  if (status !== 'closed') return false;
  const s = await cardSettings(); let did = false; let credited = 0;
  await db.runTransaction(async tx => {
    const c = (await tx.get(ref)).data(); if (!c || c.settled) return; const bal = await readBal(tx, uid); const sc = (n: number) => split(c, n);
    const adv = c.advanceUnits ?? 0; let nb = { ...bal }; let advancedNow = 0;
    if (!c.advanced && s.refundAdvance && (c.refundEstimateUnits ?? 0) > 0 && state !== 'paid') {
      advancedNow = Math.min(c.refundEstimateUnits, c.fundedTotal ?? c.refundEstimateUnits); const p = sc(advancedNow);
      const lines: any[] = [{ account: 'platform:card_refund_receivable', dir: 'debit', amount: advancedNow }]; if (p.avail) lines.push({ account: `merchant:${uid}:available`, dir: 'credit', amount: p.avail }); if (p.credit) lines.push({ account: `merchant:${uid}:card_credit`, dir: 'credit', amount: p.credit });
      postEntry(tx, `card_advance_${id}`, uid, 'card_refund_advance', lines, { cardId: id });
      nb = { ...nb, available: nb.available + p.avail, card_credit: (nb.card_credit ?? 0) + p.credit };
      writeBal(tx, uid, nb); tx.update(ref, { advanced: true, advanceUnits: advancedNow, advancedAt: Date.now() }); did = true; credited = advancedNow; return;
    }
    if (state === 'paid') {
      const actual = toUnits(cr?.amount ?? 0); const received = c.advanced ? adv : 0;
      const lines: any[] = []; const gain = Math.max(0, actual - received); const loss = Math.max(0, received - actual);
      if (actual > 0) lines.push({ account: 'central:funds', dir: 'debit', amount: actual });
      if (loss > 0) lines.push({ account: 'platform:card_refund_loss', dir: 'debit', amount: loss });
      if (c.advanced && received > 0) lines.push({ account: 'platform:card_refund_receivable', dir: 'credit', amount: received });
      if (gain > 0) { const p = sc(gain); if (p.avail) lines.push({ account: `merchant:${uid}:available`, dir: 'credit', amount: p.avail }); if (p.credit) lines.push({ account: `merchant:${uid}:card_credit`, dir: 'credit', amount: p.credit }); nb = { ...nb, available: nb.available + p.avail, card_credit: (nb.card_credit ?? 0) + p.credit }; }
      if (lines.length) { postEntry(tx, `card_settle_${id}`, uid, 'card_refund_settle', lines, { cardId: id, actual, advanced: received }); writeBal(tx, uid, nb); }
      tx.update(ref, { settled: true, settledUnits: actual, settledAt: Date.now() }); did = true; credited = gain;
    }
  });
  if (did && credited > 0) { info('cards.close_credited', { cardId: id, merchantId: uid, amount: credited }); await notify(uid, 'Carte fermée : solde crédité', `${(credited / 1e6).toFixed(2)} $ ajoutés à votre compte.`); }
  return did;
}
