import crypto from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebase-admin';
import { HttpError } from './auth';
import { addrOf, byId, Cur, fmt } from './cryptos';
import { Hit, scanIncoming, verifyEvmNative } from './chains';
import { priceUsd } from './price';
import { applyPurchase } from './purchase';
import { toUnits } from './money';
import { getSettings } from './settings';
import { info, warn } from './log';
const VALID_MS = 60 * 60_000;
export const view = (id: string, o: any) => ({ id, cur: o.cur, status: o.status, address: o.address, amount: fmt(BigInt(o.expected), o.decimals), amountUsd: String(o.usd / 1e6), expiresAt: o.expiresAt, purpose: o.purpose, txid: o.txid ?? null });
export async function createOrder(uid: string, curId: string, purpose: 'api' | 'plugin') {
  const c = byId(curId); if (!c || !addrOf(c)) throw new HttpError(400, 'currency_unavailable');
  const mine = await db.collection('crypto_orders').where('merchantId', '==', uid).get();
  const open = mine.docs.find(d => d.data().purpose === purpose && d.data().cur === c.id && d.data().status === 'awaiting' && d.data().expiresAt > Date.now() + 5 * 60_000);
  if (open) return view(open.id, open.data());
  const s = await getSettings(); const usd = toUnits(purpose === 'api' ? s.apiActivationUsd : s.pluginPriceUsd);
  let base: bigint;
  if (c.stable) base = BigInt(Math.round(usd / 1e6 * 10 ** c.decimals));
  else { let p: number; try { p = await priceUsd(c.cg!); } catch { throw new HttpError(503, 'quote_unavailable'); } base = BigInt(Math.ceil(usd / 1e6 / p * 10 ** c.decimals)); }
  // montant unique : permet d'identifier ce paiement precis sur l'adresse commune (aucun autre ordre ouvert n'a le meme montant)
  const span = c.stable ? BigInt(Math.max(1, Math.floor(0.009 * 10 ** c.decimals))) : base / 1000n + 1n;
  const taken = new Set((await db.collection('crypto_orders').where('cur', '==', c.id).where('status', '==', 'awaiting').get()).docs.map(d => d.data().expected));
  let expected = base; for (let i = 0; i < 50; i++) { const cand = base + BigInt(crypto.randomInt(1, Number(span > 1_000_000_000n ? 1_000_000_000n : span) + 1)); if (!taken.has(cand.toString())) { expected = cand; break; } }
  const ref = db.collection('crypto_orders').doc();
  const o = { merchantId: uid, purpose, cur: c.id, address: addrOf(c), decimals: c.decimals, usd, expected: expected.toString(), status: 'awaiting', createdAt: Date.now(), expiresAt: Date.now() + VALID_MS };
  await ref.set({ ...o, createdAtTs: FieldValue.serverTimestamp() }); info('crypto.order_created', { orderId: ref.id, merchantId: uid, cur: c.id, purpose, expected: o.expected }); return view(ref.id, o);
}
async function confirm(orderId: string, hit: Pick<Hit, 'txid' | 'amount'>, manual = false) {
  await db.runTransaction(async tx => {
    const r = db.doc(`crypto_orders/${orderId}`); const o = (await tx.get(r)).data()!; if (o.status === 'confirmed') return;
    tx.create(db.doc(`used_txids/${o.cur}_${hit.txid.replace(/\//g, '_')}`), { orderId, createdAt: Date.now() });   // un meme transfert ne peut servir qu'une fois
    await applyPurchase(tx, o.merchantId, o.purpose, orderId, o.usd);
    tx.update(r, { status: 'confirmed', txid: hit.txid, received: hit.amount.toString(), manual, confirmedAt: Date.now() });
  });
  const o = (await db.doc(`crypto_orders/${orderId}`).get()).data()!; info('crypto.order_confirmed', { orderId, merchantId: o.merchantId, cur: o.cur, purpose: o.purpose, txid: hit.txid, manual });
}
// Verification automatique (scan de l'adresse) ou par hash. Montant EXACT requis : empeche de reclamer le paiement d'un autre.
export async function checkOrder(uid: string | null, orderId: string, txid?: string) {
  const ref = db.doc(`crypto_orders/${orderId}`); const o = (await ref.get()).data();
  if (!o || (uid && o.merchantId !== uid)) throw new HttpError(404, 'not_found');
  if (o.status === 'confirmed') return view(orderId, o);
  if (o.expiresAt < Date.now()) { await ref.update({ status: 'expired' }); return view(orderId, { ...o, status: 'expired' }); }
  const c = byId(o.cur) as Cur; const expected = BigInt(o.expected); let hits: Hit[] = [];
  try { hits = c.scan ? await scanIncoming(c, o.address, o.createdAt - 120_000) : txid ? [await verifyEvmNative(c, txid, o.address)].filter(Boolean) as Hit[] : []; }
  catch { throw new HttpError(502, 'network_unavailable'); }
  if (txid) hits = hits.filter(h => h.txid.toLowerCase() === txid.trim().toLowerCase());
  const hit = hits.find(h => h.confirmed && h.amount === expected && h.ts >= o.createdAt - 120_000);
  if (!hit) { if (txid) warn('crypto.verify_no_match', { orderId, cur: o.cur, hits: hits.length }); return view(orderId, o); }
  try { await confirm(orderId, hit); } catch (e) { warn('crypto.confirm_failed', { orderId, message: (e as Error).message }); throw new HttpError(409, 'tx_already_used'); }
  return view(orderId, (await ref.get()).data()!);
}
export const confirmManually = async (orderId: string, txid: string) => confirm(orderId, { txid: txid || 'manual-' + orderId, amount: 0n }, true);
