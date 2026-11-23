import crypto from 'node:crypto';
import { db } from '../firebase-admin';
import { HttpError } from '../auth';
import { fromUnits, toUnits } from '../money';
import { postEntry, readBal, writeBal } from '../ledger';
import { notify } from '../audit';
import { info, warn } from '../log';
import { byId, fmt, Cur } from '../cryptos';
import { programme, grossUp, netOf } from './wallet';
import { scanIncoming } from '../chains';
import { quote, placeOrder, Spec } from './orders';
import { reserveAmount } from '../pay-amounts';
// Paiements USDT directs (collection à part : card_pay_orders). Deux usages :
//  - commander une carte / une recharge : l'USDT reçu entre directement dans la réservation de l'ordre ;
//  - recharger son « crédit cartes » (kind = deposit) : l'USDT reçu est crédité sur un solde réservé aux cartes, non retirable.
// Un paiement qui arrive APRÈS l'expiration (ou détecté tardivement) n'est jamais perdu : il est crédité sur le crédit cartes pendant 7 jours.
export const CARD_PAY = ['usdttrc20', 'usdtbsc'];
export const DEPOSIT_MIN = 5, DEPOSIT_MAX = 10_000, GRACE_MS = 7 * 24 * 3600_000, VALID_MS = 60 * 60_000;
export const payCurrencies = async () => { const { addresses } = await programme(); return CARD_PAY.map(id => byId(id)).filter((c): c is Cur => !!c && !!addresses[c.id]).map(c => ({ id: c.id, name: c.name, net: c.net })); };
export const payView = (id: string, o: Record<string, any>) => ({ id, status: o.status, kind: o.spec?.kind ?? 'issue', cur: o.cur, net: byId(o.cur)?.net ?? '', address: o.address, amount: fmt(BigInt(o.expected), o.decimals), amountUsd: fromUnits(o.chargeUnits), expiresAt: o.expiresAt, txid: o.txid ?? null, orderId: o.orderId ?? null, error: o.error ?? null });

async function newPayOrder(uid: string, curId: string, spec: Spec | { kind: 'deposit'; amount: string }, base: { chargeUnits: number; ciTotalUnits: number; markupUnits: number }) {
  const c = byId(curId), prog = await programme(), address = c ? prog.addresses[c.id] : undefined; if (!c || !CARD_PAY.includes(c.id) || !address) throw new HttpError(400, 'currency_unavailable');
  // Le prestataire retient `recharge_fee_bps` sur chaque dépôt : le montant demandé est majoré pour que le portefeuille reçoive au moins le prix net.
  const charge = prog.chargeUnits[c.id] ?? 0, gross = grossUp(base.chargeUnits + charge, prog.bps);   // + frais de dépôt en %, + network charge TRC20
  const k = 10n ** BigInt(c.decimals - 6);     // 1 unité interne (1e-6 USD) = k unités de la monnaie
  const taken = new Set<string>();             // les ordres expirés restent surveillés 7 jours : leur montant ne doit pas être réutilisé (sinon un paiement tardif pourrait être attribué à un autre)
  for (const st of ['awaiting', 'expired']) (await db.collection('card_pay_orders').where('cur', '==', c.id).where('status', '==', st).get()).docs.forEach(d => taken.add(String(d.data().expected)));
  (await db.collection('crypto_orders').where('cur', '==', c.id).where('status', '==', 'awaiting').get()).docs.forEach(d => taken.add(String(d.data().expected)));
  let off = 0; for (let i = 0; i < 40; i++) { const n = crypto.randomInt(1, 9001); const ex = (BigInt(gross + n) * k).toString(); if (!taken.has(ex) && await reserveAmount('cards', c.id, ex, Date.now() + GRACE_MS + 3600_000)) { off = n; break; } }   // centimes aléatoires (jusqu'à 0,009 $) = identifiant du paiement
  if (!off) throw new HttpError(503, 'network_unavailable');
  const now = Date.now(); const ref = db.collection('card_pay_orders').doc();
  const o = { merchantId: uid, spec, cur: c.id, decimals: c.decimals, address, feeBps: prog.bps, netCharge: charge, chargeUnits: gross + off, baseChargeUnits: base.chargeUnits, ciTotalUnits: base.ciTotalUnits, markupUnits: base.markupUnits, expected: (BigInt(gross + off) * k).toString(), status: 'awaiting', createdAt: now, expiresAt: now + VALID_MS };
  await ref.set(o); return payView(ref.id, o);
}
export async function createPayOrder(uid: string, curId: string, spec: Spec) {
  const q = await quote(uid, spec);            // revérifie maintenance / identité / minimum AVANT que l'utilisateur envoie quoi que ce soit
  return newPayOrder(uid, curId, spec, q);
}
export async function createDepositOrder(uid: string, curId: string, amount: string) {
  const u = toUnits(amount); if (u < DEPOSIT_MIN * 1e6 || u > DEPOSIT_MAX * 1e6) throw new HttpError(400, 'invalid_amount');
  return newPayOrder(uid, curId, { kind: 'deposit', amount }, { chargeUnits: u, ciTotalUnits: 0, markupUnits: 0 });
}

// Crédite le crédit cartes d'un paiement reçu (dépôt, ou paiement arrivé trop tard). Exactement une fois : la transition de statut et l'écriture comptable sont dans la même transaction.
async function creditCardBalance(id: string, from: 'paid' | 'late') {
  const ref = db.doc(`card_pay_orders/${id}`); let uid = '', amt = 0;
  const ok = await db.runTransaction(async tx => {
    const o = (await tx.get(ref)).data(); if (!o || o.status !== from) return false; const bal = await readBal(tx, o.merchantId); uid = o.merchantId; amt = Math.max(0, netOf(o.chargeUnits, o.feeBps ?? 0) - (o.netCharge ?? 0));   // crédité : ce que le portefeuille a réellement reçu, frais de dépôt du prestataire déduits
    postEntry(tx, `card_deposit_${id}`, uid, 'card_deposit', [{ account: 'central:funds', dir: 'debit', amount: amt }, { account: `merchant:${uid}:card_credit`, dir: 'credit', amount: amt }], { payOrderId: id, late: from === 'late' });
    writeBal(tx, uid, { ...bal, card_credit: (bal.card_credit ?? 0) + amt }); tx.update(ref, { status: from === 'late' ? 'late_credited' : 'fulfilled', creditedUnits: amt }); return true;
  });
  if (ok) { info('cards.deposit_credited', { payOrderId: id, merchantId: uid, amount: amt, late: from === 'late' }); await notify(uid, 'Crédit cartes rechargé', `${fromUnits(amt).replace(/0+$/, '').replace(/\.$/, '')} $ ajoutés à votre crédit cartes${from === 'late' ? ' (paiement reçu après expiration)' : ''}.`); }
  return ok;
}

export async function fulfillPayOrder(id: string) {
  const ref = db.doc(`card_pay_orders/${id}`); const o = (await ref.get()).data(); if (!o || o.status !== 'paid' || o.orderId) return;
  if (o.spec.kind === 'deposit') { await creditCardBalance(id, 'paid'); return; }
  const orderId = `po_${id}`;
  try {
    // L'utilisateur a payé chargeUnits (devis + centimes d'identification) : tout l'excédent est de la marge, jamais rendu au prestataire.
    const net = Math.max(0, netOf(o.chargeUnits, o.feeBps ?? 0) - (o.netCharge ?? 0));   // reçu par le portefeuille, après les frais de dépôt du prestataire
    await placeOrder(o.merchantId, o.spec, { chargeUnits: net, ciTotalUnits: o.ciTotalUnits, markupUnits: o.markupUnits + (net - o.baseChargeUnits) }, { source: 'crypto', fixedId: orderId, payOrderId: id });
    await ref.update({ status: 'fulfilled', orderId });
  } catch (e) { await ref.update({ status: 'failed', orderId, error: (e as HttpError).code ?? 'error' }); }   // refus définitif : finalize() a remis les fonds reçus en crédit cartes
}

export async function checkPayOrder(uid: string | null, id: string) {
  const ref = db.doc(`card_pay_orders/${id}`); let o = (await ref.get()).data();
  if (!o || (uid && o.merchantId !== uid)) throw new HttpError(404, 'not_found');
  if (o.status === 'paid') { await fulfillPayOrder(id).catch(e => warn('cards.fulfill_failed', { payOrderId: id, message: (e as Error).message })); return payView(id, (await ref.get()).data()!); }
  if (o.status !== 'awaiting' && o.status !== 'expired') return payView(id, o);
  const now = Date.now();
  if (o.status === 'awaiting' && o.expiresAt < now) { await ref.update({ status: 'expired' }); o = { ...o, status: 'expired' }; }
  if (o.status === 'expired' && o.createdAt + GRACE_MS < now) { await ref.update({ status: 'closed' }); return payView(id, { ...o, status: 'closed' }); }   // fin de la surveillance des paiements tardifs
  const c = byId(o.cur)!; let hits;
  try { hits = await scanIncoming(c, o.address, o.createdAt - 120_000); } catch { throw new HttpError(502, 'network_unavailable'); }
  const hit = hits.find(h => h.confirmed && h.amount === BigInt(o.expected) && h.ts >= o.createdAt - 120_000);
  if (!hit) return payView(id, o);
  const late = o.status === 'expired' || o.expiresAt < now; let next: 'paid' | 'late' = late ? 'late' : 'paid';
  try {
    await db.runTransaction(async tx => {
      const cur = (await tx.get(ref)).data(); if (!cur || (cur.status !== 'awaiting' && cur.status !== 'expired')) { next = 'paid'; throw new Error('already_handled'); }
      tx.create(db.doc(`used_txids/${o.cur}_${hit.txid}`), { payOrderId: id, scope: 'cards', createdAt: Date.now() });   // un même transfert ne paie jamais deux fois
      tx.update(ref, { status: next, txid: hit.txid, paidAt: Date.now() });
    });
  } catch (e) { if ((e as Error).message === 'already_handled') return payView(id, (await ref.get()).data()!); throw new HttpError(409, 'tx_already_used'); }
  if (next === 'late') await creditCardBalance(id, 'late').catch(e => warn('cards.late_credit_failed', { payOrderId: id, message: (e as Error).message }));
  else await fulfillPayOrder(id).catch(e => warn('cards.fulfill_failed', { payOrderId: id, message: (e as Error).message }));
  return payView(id, (await ref.get()).data()!);
}
