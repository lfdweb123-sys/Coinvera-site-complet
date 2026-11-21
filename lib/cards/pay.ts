import crypto from 'node:crypto';
import { db } from '../firebase-admin';
import { HttpError } from '../auth';
import { fromUnits } from '../money';
import { warn } from '../log';
import { addrOf, byId, fmt, Cur } from '../cryptos';
import { scanIncoming } from '../chains';
import { quote, placeOrder, Spec } from './orders';
// Paiement direct d'une carte en USDT : adresse + montant unique, collection à part (card_pay_orders). Une fois le paiement confirmé,
// l'USDT reçu entre directement dans la réservation de l'ordre carte (voir placeOrder, source = crypto).
export const CARD_PAY = ['usdttrc20', 'usdtbsc'];
export const payCurrencies = () => CARD_PAY.map(id => byId(id)).filter((c): c is Cur => !!c && !!addrOf(c)).map(c => ({ id: c.id, name: c.name, net: c.net }));
export const payView = (id: string, o: Record<string, any>) => ({ id, status: o.status, cur: o.cur, net: byId(o.cur)?.net ?? '', address: o.address, amount: fmt(BigInt(o.expected), o.decimals), amountUsd: fromUnits(o.chargeUnits), expiresAt: o.expiresAt, txid: o.txid ?? null, orderId: o.orderId ?? null, error: o.error ?? null });

export async function createPayOrder(uid: string, curId: string, spec: Spec) {
  const c = byId(curId); if (!c || !CARD_PAY.includes(c.id) || !addrOf(c)) throw new HttpError(400, 'currency_unavailable');
  const q = await quote(uid, spec);            // revérifie maintenance / identité / minimum AVANT que l'utilisateur envoie quoi que ce soit
  const k = 10n ** BigInt(c.decimals - 6);     // 1 unité interne (1e-6 USD) = k unités de la monnaie
  const taken = new Set<string>();
  for (const col of ['card_pay_orders', 'crypto_orders']) (await db.collection(col).where('cur', '==', c.id).where('status', '==', 'awaiting').get()).docs.forEach(d => taken.add(String(d.data().expected)));
  let expected = 0n;                           // centimes aléatoires (jusqu'à 0,009 $) pour que deux commandes en attente n'aient jamais le même montant
  for (let i = 0; i < 30; i++) { const e = BigInt(q.chargeUnits) * k + BigInt(crypto.randomInt(1, 9001)) * k; if (!taken.has(e.toString())) { expected = e; break; } }
  if (!expected) throw new HttpError(503, 'network_unavailable');
  const now = Date.now(); const ref = db.collection('card_pay_orders').doc();
  const o = { merchantId: uid, spec, cur: c.id, decimals: c.decimals, address: addrOf(c), chargeUnits: q.chargeUnits + Number(((expected - BigInt(q.chargeUnits) * k) / k)), baseChargeUnits: q.chargeUnits, ciTotalUnits: q.ciTotalUnits, markupUnits: q.markupUnits, expected: expected.toString(), status: 'awaiting', createdAt: now, expiresAt: now + 60 * 60_000 };
  await ref.set(o); return payView(ref.id, o);
}

export async function fulfillPayOrder(id: string) {
  const ref = db.doc(`card_pay_orders/${id}`); const o = (await ref.get()).data(); if (!o || o.status !== 'paid' || o.orderId) return;
  const orderId = `po_${id}`;
  try {
    // L'utilisateur a payé chargeUnits (devis + centimes d'unicité) : tout l'excédent est de la marge, jamais rendu au prestataire.
    await placeOrder(o.merchantId, o.spec, { chargeUnits: o.chargeUnits, ciTotalUnits: o.ciTotalUnits, markupUnits: o.markupUnits + (o.chargeUnits - o.baseChargeUnits) }, { source: 'crypto', fixedId: orderId, payOrderId: id });
    await ref.update({ status: 'fulfilled', orderId });
  } catch (e) { await ref.update({ status: 'failed', orderId, error: (e as HttpError).code ?? 'error' }); }   // refus définitif : les fonds reçus ont été rendus au solde par finalize()
}

export async function checkPayOrder(uid: string | null, id: string) {
  const ref = db.doc(`card_pay_orders/${id}`); const o = (await ref.get()).data();
  if (!o || (uid && o.merchantId !== uid)) throw new HttpError(404, 'not_found');
  if (o.status === 'paid') { await fulfillPayOrder(id).catch(e => warn('cards.fulfill_failed', { payOrderId: id, message: (e as Error).message })); return payView(id, (await ref.get()).data()!); }
  if (o.status !== 'awaiting') return payView(id, o);
  if (o.expiresAt < Date.now()) { await ref.update({ status: 'expired' }); return payView(id, { ...o, status: 'expired' }); }
  const c = byId(o.cur)!; let hits;
  try { hits = await scanIncoming(c, o.address, o.createdAt - 120_000); } catch { throw new HttpError(502, 'network_unavailable'); }
  const hit = hits.find(h => h.confirmed && h.amount === BigInt(o.expected) && h.ts >= o.createdAt - 120_000);
  if (!hit) return payView(id, o);
  try {
    await db.runTransaction(async tx => {
      const cur = (await tx.get(ref)).data(); if (!cur || cur.status !== 'awaiting') return;
      tx.create(db.doc(`used_txids/${o.cur}_${hit.txid}`), { payOrderId: id, scope: 'cards', createdAt: Date.now() });   // un même transfert ne paie jamais deux fois
      tx.update(ref, { status: 'paid', txid: hit.txid, paidAt: Date.now() });
    });
  } catch { throw new HttpError(409, 'tx_already_used'); }
  await fulfillPayOrder(id).catch(e => warn('cards.fulfill_failed', { payOrderId: id, message: (e as Error).message }));
  return payView(id, (await ref.get()).data()!);
}
