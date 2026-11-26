import { db } from '../firebase-admin';
import { HttpError } from '../auth';
import { postEntry, readBal, writeBal } from '../ledger';
import { notify } from '../audit';
import { info } from '../log';
import { spx, sp, SpError, publicCode } from './client';
import { centsToUnits } from './pricing';

// Cartes d'un utilisateur : `scarab_cards` est le registre de PROPRIÉTÉ. La clé API du prestataire opère sur TOUTES nos cartes,
// c'est donc nous qui garantissons que l'utilisateur A ne touche jamais la carte de l'utilisateur B. Le solde et le statut sont relus à la source.
// Anti-contournement : l'argent entré par le crédit cartes pro (dépôt, non retirable) ne doit jamais ressortir en solde retirable en passant par une carte.
// Chaque carte mémorise ce qui l'a financée (fundedTotal / fundedFromCredit) ; tout retour d'argent de la carte (retrait vers le solde, fermeture) est ventilé au même prorata
// et la part « crédit » retourne dans le crédit, dans la limite de ce que la carte a reçu du crédit (returnedToCredit).
export function splitRefund(c: Record<string, any> | undefined, x: number) {
  const total = c?.fundedTotal ?? 0, fromCredit = c?.fundedFromCredit ?? 0;
  const credit = total > 0 && fromCredit > 0 ? Math.min(x, Math.round(x * Math.min(1, fromCredit / total)), Math.max(0, fromCredit - (c?.returnedToCredit ?? 0))) : 0;
  return { credit, avail: x - credit };
}
export const LIVE = ['pending', 'active', 'frozen'];
export const cardRef = (id: string) => db.doc(`scarab_cards/${id}`);
export const cardPatch = (c: any) => ({ cardId: c.id, productId: c.product_id ?? null, customerId: c.customer_id ?? null, nameOnCard: c.name_on_card ?? null, status: c.status ?? 'pending', mode: c.mode ?? null,
  last4: c.last4 || null, expiry: c.expiry || null, currency: c.currency ?? 'USD', balanceMinor: Number.isFinite(Number(c.balance_minor)) ? Number(c.balance_minor) : null, declineCount: c.decline_violations?.count ?? 0, issuedAt: c.created_at ?? null, updatedAt: Date.now() });
export async function saveCard(uid: string, c: any) { await cardRef(c.id).set({ merchantId: uid, ...cardPatch(c) }, { merge: true }); }
export async function ownedCard(uid: string, id: string) {
  if (!/^[0-9A-Za-z]{26}$/.test(id)) throw new HttpError(404, 'card_not_found');
  const s = await cardRef(id).get(); if (!s.exists || s.data()!.merchantId !== uid) throw new HttpError(404, 'card_not_found');
  return s.data() as Record<string, any>;
}
export async function refreshCard(uid: string, id: string) {
  await ownedCard(uid, id); const c = (await spx('GET', `/cards/${id}`)).data; if (c?.id) await cardRef(id).set(cardPatch(c), { merge: true }); return c;
}
const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);   // « 2026-11 » (UTC)
export const cardView = (c: Record<string, any>) => ({ spentMonth: c.statsMonth === monthKey() && c.spentMinor != null ? (c.spentMinor / 100).toFixed(2) : null, id: c.cardId, last4: c.last4, status: c.status, nameOnCard: c.nameOnCard, productId: c.productId, balance: c.balanceMinor != null ? (c.balanceMinor / 100).toFixed(2) : null, expiry: c.expiry,
  declineCount: c.declineCount ?? 0, codeWaiting: !!c.codeWaiting, terminating: !!c.terminateRequestedAt && !['terminated', 'expired'].includes(c.status), issuedAt: c.issuedAt });

// Dépenses du mois en cours : achats réglés moins remboursements, d'après les opérations rapportées par le réseau carte. Calcul mis en cache sur la carte (10 min) ; 5 pages d'opérations au plus.
// Somme des achats réglés moins les remboursements depuis `startMs` ; `older` = une opération antérieure à cette date a été vue (inutile de lire les pages suivantes, la liste est triée du plus récent au plus ancien).
export function sumSpent(txs: { at?: string | null; amount: string; status?: string; type: string }[], startMs: number) {
  let spent = 0, older = false;
  for (const t of txs) { const at = Date.parse(t.at ?? ''); if (Number.isFinite(at) && at < startMs) { older = true; continue; } if (t.status !== 'completed') continue; const a = Math.round(Number(t.amount) * 100); if (t.type === TYPES.capture) spent += a; else if (t.type === TYPES.refund) spent -= a; }
  return { spent, older };
}
export async function refreshSpent(uid: string, id: string) {
  const start = Date.parse(monthKey() + '-01T00:00:00Z'); let cursor: string | undefined, spent = 0;
  for (let i = 0; i < 5; i++) { const r = await cardTransactions(uid, id, cursor), x = sumSpent(r.transactions, start); spent += x.spent; if (x.older || !r.next) break; cursor = r.next; }
  await cardRef(id).set({ statsMonth: monthKey(), spentMinor: Math.max(0, spent), statsAt: Date.now() }, { merge: true });
}
// Vue d'ensemble : on relit en parallèle les cartes dont la copie date de plus de 20 s (jamais plus de 12 appels).
export async function listCards(uid: string) {
  const docs = (await db.collection('scarab_cards').where('merchantId', '==', uid).get()).docs.map(d => d.data());
  const stale = docs.filter(c => !['terminated', 'expired', 'failed'].includes(c.status) && Date.now() - (c.updatedAt ?? 0) > 20_000).slice(0, 12);
  const needStats = docs.filter(c => ['active', 'frozen'].includes(c.status) && (c.statsMonth !== monthKey() || Date.now() - (c.statsAt ?? 0) > 600_000)).slice(0, 6);
  await Promise.allSettled([...stale.map(c => refreshCard(uid, c.cardId)), ...needStats.map(c => refreshSpent(uid, c.cardId))]);
  const fresh = stale.length || needStats.length ? (await db.collection('scarab_cards').where('merchantId', '==', uid).get()).docs.map(d => d.data()) : docs;
  return fresh.map(cardView).sort((a, b) => String(b.issuedAt ?? '').localeCompare(String(a.issuedAt ?? '')));
}
export const liveCount = async (uid: string) => (await db.collection('scarab_cards').where('merchantId', '==', uid).get()).docs.filter(d => LIVE.includes(d.data().status)).length;

// Détails complets (numéro, code, date) : seulement à l'ouverture de la carte, jamais stockés ni journalisés. Une carte Platinum renvoie une page sécurisée (secure_view_url) valable ~1 minute.
export async function cardDetails(uid: string, id: string) {
  await ownedCard(uid, id); const d = (await spx('GET', `/cards/${id}/details`)).data ?? {};
  return d.type === 'secure_view' ? { type: 'secure_view', url: d.secure_view_url ?? null, expiresAt: d.secure_view_expires_at ?? null, name: d.cardholder_name ?? null }
    : { type: 'details', pan: d.pan ?? null, cvv: d.security_code ?? null, expiry: d.expiry ?? null, name: d.cardholder_name ?? null };
}
export async function freezeCard(uid: string, id: string, action: 'freeze' | 'unfreeze') {
  await ownedCard(uid, id); const c = (await spx('POST', `/cards/${id}/${action}`)).data; if (c?.id) await cardRef(id).set(cardPatch(c), { merge: true });
}
const TYPES: Record<string, string> = { authorization: 'Autorisation', capture: 'Paiement', refund: 'Remboursement', reversal: 'Annulation', decline: 'Paiement refusé', verification: 'Vérification', funding: 'Rechargement', withdrawal: 'Retrait', other: 'Opération' };
export async function cardTransactions(uid: string, id: string, cursor?: string) {
  await ownedCard(uid, id); const r = await spx('GET', `/cards/${id}/transactions`, { query: { per_page: 20, cursor } });
  return { next: r.meta?.has_more ? r.meta.next_cursor ?? null : null, transactions: ((r.data as any[]) ?? []).map(t => ({ id: t.id, at: t.occurred_at, amount: (Number(t.amount_minor) / 100).toFixed(2), currency: t.currency, merchant: t.merchant_name ?? null, type: TYPES[t.type] ?? 'Opération', direction: ['refund', 'reversal', 'funding'].includes(t.type) ? 'in' : 'out',
    status: t.status, reason: t.decline_reason ?? null, channel: t.channel ?? null })) };
}

// Fermeture : définitive, 24 h minimum après la création. Clé d'idempotence par carte et par heure : un double clic est rejoué, un nouvel essai le lendemain repart propre.
export async function terminateCard(uid: string, id: string, reason: string) {
  await ownedCard(uid, id);
  try { const r = await sp('POST', `/cards/${id}/terminate`, { body: { reason }, idem: `cv-sp-term-${id}-${Math.floor(Date.now() / 3_600_000)}` }); if (r.data?.id) await cardRef(id).set(cardPatch(r.data), { merge: true }); }
  catch (e) { if (e instanceof SpError) throw new HttpError(e.status === 429 ? 429 : 409, publicCode(e)); throw e; }
  await cardRef(id).set({ terminateRequestedAt: Date.now(), updatedAt: Date.now() }, { merge: true });
}
// Le solde d'une carte fermée revient au portefeuille du programme (moins les frais de fermeture, déjà déduits par le prestataire) : on le crédite à
// l'utilisateur quand l'événement card.terminated en donne le montant exact. Idempotent : une seule écriture par carte.
export async function creditTermination(id: string, refundedMinor: number) {
  const ref = cardRef(id); let uid = '', credited = false; const amt = centsToUnits(Math.max(0, Math.floor(refundedMinor)));
  await db.runTransaction(async tx => {
    const c = (await tx.get(ref)).data(); if (!c || c.terminationCredited) return; uid = c.merchantId;
    const bal = await readBal(tx, uid); const p = splitRefund(c, amt);
    if (amt > 0) { postEntry(tx, `scarab_refund_${id}`, uid, 'scarab_refund', [{ account: 'central:funds', dir: 'debit', amount: amt }, ...(p.avail ? [{ account: `merchant:${uid}:available`, dir: 'credit' as const, amount: p.avail }] : []), ...(p.credit ? [{ account: `merchant:${uid}:scarab_credit`, dir: 'credit' as const, amount: p.credit }] : [])], { cardId: id }); writeBal(tx, uid, { ...bal, available: bal.available + p.avail, scarab_credit: (bal.scarab_credit ?? 0) + p.credit }); }
    tx.set(ref, { status: 'terminated', terminationCredited: true, refundedUnits: amt, returnedToCredit: (c.returnedToCredit ?? 0) + p.credit, updatedAt: Date.now() }, { merge: true }); credited = true;
  });
  if (credited) { info('scarab.terminated', { cardId: id, merchantId: uid, refunded: amt }); await notify(uid, 'Carte fermée', amt > 0 ? `${(amt / 1e6).toFixed(2)} $ ajoutés à votre solde (la part financée par votre dépôt retourne dans votre crédit cartes pro).` : 'Votre carte a été fermée.'); }
  return credited;
}
