import crypto from 'node:crypto';
import { db } from '../firebase-admin';
import { HttpError } from '../auth';
import { fromUnits } from '../money';
import { warn } from '../log';
import { byId, fmt, Cur } from '../cryptos';
import { spx } from './client';
import { scanIncoming } from '../chains';
import { quote, placeOrder, Spec, Quote } from './orders';
// Paiement direct de la Virtuals cards pro en USDT : adresse + montant unique, collection à part (scarab_pay_orders). Une fois le paiement confirmé,
// l'USDT reçu entre directement dans la réservation de l'ordre (placeOrder, source = crypto). Même mécanique que les cartes existantes, sans la partager.
export const SCARAB_PAY = ['usdttrc20', 'usdtbsc'];
// Adresses de dépôt PERMANENTES du compte chez le prestataire (une par réseau, GET /deposit-addresses) : l'USDT de l'utilisateur arrive directement dans le portefeuille qui finance les cartes.
// Une adresse qui exige un mémo ne peut pas être attribuée automatiquement (un transfert TRC20/BEP20 n'en porte pas) : elle est écartée.
const NET: Record<string, string> = { usdttrc20: 'trc20', usdtbsc: 'bep20' };
let cache: { t: number; a: Record<string, string> } | null = null;
export async function depositAddresses(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.t < 60_000) return cache.a;
  const out: Record<string, string> = {};
  try { for (const d of ((await spx('GET', '/deposit-addresses')).data ?? []) as any[]) { const id = Object.keys(NET).find(k => NET[k] === String(d.network).toLowerCase()); if (id && String(d.asset).toUpperCase() === 'USDT' && d.address && !d.memo) out[id] = String(d.address); } }
  catch (e) { warn('scarab.deposit_addresses_failed', { message: (e as Error).message }); return cache?.a ?? {}; }
  cache = { t: Date.now(), a: out }; return out;
}
export const payCurrencies = async () => { const a = await depositAddresses(); return SCARAB_PAY.map(id => byId(id)).filter((c): c is Cur => !!c && !!a[c.id]).map(c => ({ id: c.id, name: c.name, net: c.net })); };
export const payView = (id: string, o: Record<string, any>) => ({ id, status: o.status, cur: o.cur, net: byId(o.cur)?.net ?? '', address: o.address, amount: fmt(BigInt(o.expected), o.decimals), amountUsd: fromUnits(o.chargeUnits), expiresAt: o.expiresAt, txid: o.txid ?? null, orderId: o.orderId ?? null, error: o.error ?? null });

export async function createPayOrder(uid: string, curId: string, spec: Spec) {
  const c = byId(curId), address = c ? (await depositAddresses())[c.id] : undefined; if (!c || !SCARAB_PAY.includes(c.id) || !address) throw new HttpError(400, 'currency_unavailable');
  const q = await quote(uid, spec);            // revérifie identité, minimum, prix et portefeuille AVANT que l'utilisateur envoie quoi que ce soit
  const k = 10n ** BigInt(c.decimals - 6);     // 1 unité interne (1e-6 USD) = k unités de la monnaie
  const taken = new Set<string>();
  for (const col of ['scarab_pay_orders', 'card_pay_orders', 'crypto_orders']) (await db.collection(col).where('cur', '==', c.id).where('status', '==', 'awaiting').get()).docs.forEach(d => taken.add(String(d.data().expected)));
  let expected = 0n;                           // centimes aléatoires (jusqu'à 0,009 $) : deux commandes en attente n'ont jamais le même montant
  for (let i = 0; i < 30; i++) { const e = BigInt(q.chargeUnits) * k + BigInt(crypto.randomInt(1, 9001)) * k; if (!taken.has(e.toString())) { expected = e; break; } }
  if (!expected) throw new HttpError(503, 'network_unavailable');
  const now = Date.now(); const ref = db.collection('scarab_pay_orders').doc();
  const o = { merchantId: uid, spec, cur: c.id, decimals: c.decimals, address, chargeUnits: q.chargeUnits + Number((expected - BigInt(q.chargeUnits) * k) / k), q: { amountMinor: q.amountMinor, feeMinor: q.feeMinor, costFeeMinor: q.costFeeMinor, customerId: q.customerId, productName: q.productName },
    expected: expected.toString(), status: 'awaiting', createdAt: now, expiresAt: now + 60 * 60_000 };
  await ref.set(o); return payView(ref.id, o);
}

export async function fulfillPayOrder(id: string) {
  const ref = db.doc(`scarab_pay_orders/${id}`); const o = (await ref.get()).data(); if (!o || o.status !== 'paid' || o.orderId) return;
  const orderId = `spo_${id}`;
  try {
    // L'utilisateur a payé chargeUnits (devis + centimes d'unicité) : tout l'excédent est de la marge, jamais rendu au prestataire.
    await placeOrder(o.merchantId, o.spec, { spec: o.spec, ...o.q, chargeUnits: o.chargeUnits } as Quote, { source: 'crypto', fixedId: orderId, payOrderId: id });
    await ref.update({ status: 'fulfilled', orderId });
  } catch (e) { await ref.update({ status: 'failed', orderId, error: (e as HttpError).code ?? 'error' }); }   // refus définitif : les fonds reçus ont été rendus au solde par finalize()
}

export async function checkPayOrder(uid: string | null, id: string) {
  const ref = db.doc(`scarab_pay_orders/${id}`); const o = (await ref.get()).data();
  if (!o || (uid && o.merchantId !== uid)) throw new HttpError(404, 'not_found');
  if (o.status === 'paid') { await fulfillPayOrder(id).catch(e => warn('scarab.fulfill_failed', { payOrderId: id, message: (e as Error).message })); return payView(id, (await ref.get()).data()!); }
  if (o.status !== 'awaiting') return payView(id, o);
  if (o.expiresAt < Date.now()) { await ref.update({ status: 'expired' }); return payView(id, { ...o, status: 'expired' }); }
  const c = byId(o.cur)!; let hits;
  try { hits = await scanIncoming(c, o.address, o.createdAt - 120_000); } catch { throw new HttpError(502, 'network_unavailable'); }
  const hit = hits.find(h => h.confirmed && h.amount === BigInt(o.expected) && h.ts >= o.createdAt - 120_000);
  if (!hit) return payView(id, o);
  try {
    await db.runTransaction(async tx => {
      const cur = (await tx.get(ref)).data(); if (!cur || cur.status !== 'awaiting') return;
      tx.create(db.doc(`used_txids/${o.cur}_${hit.txid}`), { payOrderId: id, scope: 'scarab', createdAt: Date.now() });   // un même transfert ne paie jamais deux fois
      tx.update(ref, { status: 'paid', txid: hit.txid, paidAt: Date.now() });
    });
  } catch { throw new HttpError(409, 'tx_already_used'); }
  await fulfillPayOrder(id).catch(e => warn('scarab.fulfill_failed', { payOrderId: id, message: (e as Error).message }));
  return payView(id, (await ref.get()).data()!);
}
