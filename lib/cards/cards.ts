import { db } from '../firebase-admin';
import { HttpError } from '../auth';
import { postEntry, readBal, writeBal } from '../ledger';
import { toUnits } from '../money';
import { notify } from '../audit';
import { info } from '../log';
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
  return { live: !!r.live, cardBalance: r.card_balance ?? null, issuerFee: r.issuer_fee ?? null, railFee: r.rail_return_fee ?? null, closeFee: r.close_fee ?? null, gas: r.gas ?? null, refund: r.refund ?? null, etaTypical: q.refund_eta_typical ?? null, etaMaxDays: q.refund_eta_max_days ?? null, etaWorkingDays: q.refund_eta_working_days ?? null };
}
export async function closeCard(uid: string, id: number) {
  await ownedCard(uid, id); const h = await requireHolder(uid);
  const r = await ci('DELETE', `/v1/cards/${id}`, { body: { user_id: h.externalId } });
  await db.doc(`card_items/${id}`).set({ closeRequestedAt: Date.now(), updatedAt: Date.now() }, { merge: true });
  return { state: r.status === 202 ? 'in_progress' : 'closed' };
}
// Le solde d'une carte fermée revient chez nous (portefeuille du programme), pas chez l'utilisateur : on le crédite sur son solde Coinvera
// uniquement quand le prestataire confirme que le remboursement est arrivé (close_refund.state = paid), pour ne jamais créditer des fonds que nous n'avons pas.
export async function checkClose(uid: string, id: number) {
  const ref = db.doc(`card_items/${id}`); const c = (await ref.get()).data();
  if (!c || c.merchantId !== uid || !c.closeRequestedAt || c.closeCredited) return false;
  const h = await requireHolder(uid); const d = (await ci('GET', `/v1/cards/${id}`, { query: { user_id: h.externalId } })).data;
  const status = d.card?.status_normalized; if (status) await ref.set({ status, updatedAt: Date.now() }, { merge: true });
  if (status !== 'closed' || d.close_refund?.state !== 'paid') return false;
  const amt = toUnits(d.close_refund.amount ?? 0); let credited = false;
  await db.runTransaction(async tx => {
    const cur = (await tx.get(ref)).data(); if (!cur || cur.closeCredited) return;
    const bal = await readBal(tx, uid);
    if (amt > 0) { postEntry(tx, `card_refund_${id}`, uid, 'card_refund', [{ account: 'central:funds', dir: 'debit', amount: amt }, { account: `merchant:${uid}:available`, dir: 'credit', amount: amt }], { cardId: id }); writeBal(tx, uid, { ...bal, available: bal.available + amt }); }
    tx.update(ref, { closeCredited: true, creditedUnits: amt, creditedAt: Date.now() }); credited = true;
  });
  if (credited) { info('cards.close_credited', { cardId: id, merchantId: uid, amount: amt }); if (amt > 0) await notify(uid, 'Carte fermée : solde crédité', `${(amt / 1e6).toFixed(2)} $ ajoutés à votre solde.`); }
  return credited;
}
