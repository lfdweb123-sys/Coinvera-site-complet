import { reserveAmount } from '../pay-amounts';
import { postEntry, readBal, writeBal } from '../ledger';
import { toUnits } from '../money';
import { notify } from '../audit';
import { receiptScarabDeposit } from '../receipt-events';
import crypto from 'node:crypto';
import { db } from '../firebase-admin';
import { HttpError } from '../auth';
import { fromUnits } from '../money';
import { warn } from '../log';
import { byId, fmt, Cur, networkWarning, stableId, stableFromAssetId } from '../cryptos';
import { spx } from './client';
import { scanIncoming } from '../chains';
import { quote, placeOrder, Spec, Quote } from './orders';
// Paiement direct de la Virtuals cards pro en USDT : adresse + montant unique, collection à part (scarab_pay_orders). Une fois le paiement confirmé,
// l'USDT reçu entre directement dans la réservation de l'ordre (placeOrder, source = crypto). Même mécanique que les cartes existantes, sans la partager.
// Réseaux et cryptos acceptés : tout couple (crypto, réseau) que le prestataire expose ET que la chaîne sait surveiller (lib/chains.ts).
export const SCARAB_PAY = ['usdttrc20', 'usdtbsc', 'usdterc20', 'usdtpolygon', 'usdtsol', 'usdcsol', 'usdctrc20', 'usdcbsc', 'usdc', 'usdcpolygon'];
// Adresses de dépôt PERMANENTES du compte chez le prestataire (une par réseau, GET /deposit-addresses) : l'USDT/USDC de l'utilisateur arrive directement dans le portefeuille qui finance les cartes.
// Une adresse qui exige un mémo ne peut pas être attribuée automatiquement (un transfert de jeton n'en porte pas) : elle est écartée.
const assetsOf = (d: any): string[] => { const v = d.assets ?? d.asset ?? d.supported_assets ?? d.tokens ?? d.currency ?? d.coin; // Le prestataire renvoie plusieurs actifs dans une seule chaîne (« USDC,USDT ») : on sépare sur virgule, point-virgule, barre, « + » et espaces.
  return (Array.isArray(v) ? v : v ? [v] : []).flatMap((x: any) => String(typeof x === 'object' ? x?.symbol ?? x?.asset ?? x?.id : x).split(/[\s,;/|+]+/)).map((x: string) => x.trim().toUpperCase()).filter(Boolean); };
let cache: { t: number; a: Record<string, string> } | null = null;
/** Réponse brute du prestataire -> adresses par identifiant de crypto (ex. usdctrc20). Exportée pour les tests. */
export function mapDepositAddresses(rows: any[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of rows) {
    if (!d?.address || d.memo) continue;
    // Écritures tolérées : réseau « trc20 / TRON / bsc / matic / ethereum… » + crypto « USDT », ou identifiant composé « usdt_trc20 » (dans asset, id ou currency).
    for (const a of assetsOf(d)) { const id = (d.network ? stableId(a, String(d.network)) : undefined) ?? stableFromAssetId(a); if (id && SCARAB_PAY.includes(id) && !out[id]) out[id] = String(d.address); }
  }
  return out;
}
export async function depositAddresses(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.t < 60_000) return cache.a;
  let out: Record<string, string>;
  try { const rows = ((await spx('GET', '/deposit-addresses')).data ?? []) as any[]; out = mapDepositAddresses(rows);
    const lost = rows.filter(d => !Object.keys(mapDepositAddresses([d])).length).map(d => `${d?.network}/${assetsOf(d).join('+') || '?'}${d?.memo ? '(mémo)' : ''}`);
    if (lost.length) warn('scarab.deposit_addresses_unmapped', { rows: lost.join(',') }); }
  catch (e) { warn('scarab.deposit_addresses_failed', { message: (e as Error).message }); return cache?.a ?? {}; }
  cache = { t: Date.now(), a: out }; return out;
}
// Le prestataire convertit chaque dépôt avec un taux (ex. 0,9999) : on prend le plus bas des derniers dépôts crédités (GET /deposits) et on majore le montant demandé d'autant. Repli prudent : 0,9990.
let rc: { t: number; r: number } | null = null;
export async function depositRate(): Promise<number> {
  if (rc && Date.now() - rc.t < 300_000) return rc.r;
  let r = 0.999;
  try { const rates = (((await spx('GET', '/deposits', { query: { limit: 20 } })).data ?? []) as any[]).filter(d => ['credited', 'flagged'].includes(d.status)).map(d => Number(d.rate)).filter(x => x > 0.95 && x <= 1); if (rates.length) r = Math.min(...rates); } catch { /* clé de test ou prestataire injoignable : repli */ }
  rc = { t: Date.now(), r }; return r;
}
export const payCurrencies = async () => { const a = await depositAddresses(); return SCARAB_PAY.map(id => byId(id)).filter((c): c is Cur => !!c && !!a[c.id]).map(c => ({ id: c.id, sym: c.sym, name: c.name, net: c.net, warning: networkWarning(c) })); };
export const payView = (id: string, o: Record<string, any>) => ({ id, status: o.status, cur: o.cur, net: byId(o.cur)?.net ?? '', address: o.address, amount: fmt(BigInt(o.expected), o.decimals), amountUsd: fromUnits(o.deposit ? o.creditUnits : o.chargeUnits), deposit: !!o.deposit, expiresAt: o.expiresAt, txid: o.txid ?? null, orderId: o.orderId ?? null, error: o.error ?? null });

async function uniqueExpected(c: Cur, need: number) {
  const k = 10n ** BigInt(c.decimals - 6);     // 1 unité interne (1e-6 USD) = k unités de la monnaie
  const taken = new Set<string>();
  for (const col of ['scarab_pay_orders', 'card_pay_orders', 'crypto_orders']) (await db.collection(col).where('cur', '==', c.id).where('status', '==', 'awaiting').get()).docs.forEach(d => taken.add(String(d.data().expected)));
  (await db.collection('scarab_pay_orders').where('cur', '==', c.id).where('status', '==', 'expired').get()).docs.forEach(d => taken.add(String(d.data().expected)));   // dépôts expirés encore surveillés (période de grâce)
  let expected = 0n;                           // centimes aléatoires (jusqu'à 0,009 $) : deux commandes en attente n'ont jamais le même montant
  for (let i = 0; i < 30; i++) { const e = BigInt(need) * k + BigInt(crypto.randomInt(1, 9001)) * k; if (!taken.has(e.toString()) && await reserveAmount('scarab', c.id, e.toString(), Date.now() + 8 * 24 * 3600_000)) { expected = e; break; } }
  if (!expected) throw new HttpError(503, 'network_unavailable');
  return { expected, k };
}
export async function createPayOrder(uid: string, curId: string, spec: Spec) {
  const c = byId(curId), address = c ? (await depositAddresses())[c.id] : undefined; if (!c || !SCARAB_PAY.includes(c.id) || !address) throw new HttpError(400, 'currency_unavailable');
  const q = await quote(uid, spec); const rate = await depositRate(), need = Math.ceil(q.chargeUnits / rate);            // revérifie identité, minimum, prix et portefeuille AVANT que l'utilisateur envoie quoi que ce soit
  const { expected, k } = await uniqueExpected(c, need);
  const now = Date.now(); const ref = db.collection('scarab_pay_orders').doc();
  const o = { merchantId: uid, spec, cur: c.id, decimals: c.decimals, address, chargeUnits: need + Number((expected - BigInt(need) * k) / k), q: { amountMinor: q.amountMinor, feeMinor: q.feeMinor, costFeeMinor: q.costFeeMinor, customerId: q.customerId, productName: q.productName },
    expected: expected.toString(), status: 'awaiting', createdAt: now, expiresAt: now + 60 * 60_000 };
  await ref.set(o); return payView(ref.id, o);
}

// Dépôt seul (comme les cartes standard) : l'USDT reçu alimente le CRÉDIT CARTES PRO de l'utilisateur, utilisable uniquement pour créer ou recharger une carte (jamais retirable).
// L'utilisateur envoie le montant + une petite majoration (taux de conversion du prestataire + centimes d'unicité) : le crédit est exactement le montant demandé.
export const DEPOSIT_GRACE_MS = 7 * 24 * 3600_000;
export const DEPOSIT_MIN = 5, DEPOSIT_MAX = 10_000;
export async function createDepositOrder(uid: string, curId: string, amount: string) {
  const c = byId(curId), address = c ? (await depositAddresses())[c.id] : undefined; if (!c || !SCARAB_PAY.includes(c.id) || !address) throw new HttpError(400, 'currency_unavailable');
  const u = toUnits(amount); if (!(u >= DEPOSIT_MIN * 1e6 && u <= DEPOSIT_MAX * 1e6)) throw new HttpError(400, 'invalid_amount');
  const rate = await depositRate(), need = Math.ceil(u / rate); const { expected, k } = await uniqueExpected(c, need);
  const now = Date.now(); const ref = db.collection('scarab_pay_orders').doc();
  const o = { merchantId: uid, deposit: true, spec: { kind: 'deposit', amount }, creditUnits: u, cur: c.id, decimals: c.decimals, address, chargeUnits: need + Number((expected - BigInt(need) * k) / k),
    expected: expected.toString(), status: 'awaiting', createdAt: now, expiresAt: now + 60 * 60_000 };
  await ref.set(o); return payView(ref.id, o);
}
async function creditDeposit(id: string) {
  const ref = db.doc(`scarab_pay_orders/${id}`); let uid = '', amt = 0;
  const ok = await db.runTransaction(async tx => {
    const o = (await tx.get(ref)).data(); if (!o || !o.deposit || o.status !== 'paid') return false; uid = o.merchantId; amt = o.creditUnits as number; const bal = await readBal(tx, uid);
    postEntry(tx, `scarab_deposit_${id}`, uid, 'scarab_deposit', [{ account: 'central:funds', dir: 'debit', amount: amt }, { account: `merchant:${uid}:scarab_credit`, dir: 'credit', amount: amt }], { payOrderId: id });
    writeBal(tx, uid, { ...bal, scarab_credit: (bal.scarab_credit ?? 0) + amt }); tx.update(ref, { status: 'fulfilled', creditedUnits: amt }); return true;
  });
  if (ok) { await notify(uid, 'Crédit Virtuals cards pro rechargé', `${fromUnits(amt).replace(/0+$/, '').replace(/\.$/, '')} $ ajoutés : vous pouvez maintenant payer votre carte.`).catch(() => {}); await receiptScarabDeposit(id); }
  return ok;
}

export async function fulfillPayOrder(id: string) {
  const ref = db.doc(`scarab_pay_orders/${id}`); const o = (await ref.get()).data(); if (!o || o.status !== 'paid' || o.orderId) return;
  if (o.deposit) { await creditDeposit(id); return; }
  const orderId = `spo_${id}`;
  try {
    // L'utilisateur a payé chargeUnits (devis + centimes d'unicité) : tout l'excédent est de la marge, jamais rendu au prestataire.
    await placeOrder(o.merchantId, o.spec, { spec: o.spec, ...o.q, chargeUnits: o.chargeUnits } as Quote, { source: 'crypto', fixedId: orderId, payOrderId: id });
    await ref.update({ status: 'fulfilled', orderId });
  } catch (e) { await ref.update({ status: 'failed', orderId, error: (e as HttpError).code ?? 'error' }); }   // refus définitif : les fonds reçus ont été rendus au solde par finalize()
}

export async function checkPayOrder(uid: string | null, id: string) {
  const ref = db.doc(`scarab_pay_orders/${id}`); let o = (await ref.get()).data();
  if (!o || (uid && o.merchantId !== uid)) throw new HttpError(404, 'not_found');
  if (o.status === 'paid') { await fulfillPayOrder(id).catch(e => warn('scarab.fulfill_failed', { payOrderId: id, message: (e as Error).message })); return payView(id, (await ref.get()).data()!); }
  if (o.status !== 'awaiting' && !(o.status === 'expired' && o.deposit)) return payView(id, o);
  const now = Date.now();
  // Dépôt seul : un paiement arrivé après les 60 minutes est quand même crédité pendant 7 jours (montant exact unique, donc sans ambiguïté). Les commandes d'achat gardent la validité de 60 min (devis figé).
  if (o.status === 'awaiting' && o.expiresAt < now) { await ref.update({ status: 'expired' }); o = { ...o, status: 'expired' }; if (!o.deposit) return payView(id, o); }
  if (o.status === 'expired' && o.createdAt + DEPOSIT_GRACE_MS < now) { await ref.update({ status: 'closed' }); return payView(id, { ...o, status: 'closed' }); }
  const c = byId(o.cur)!; let hits;
  try { hits = await scanIncoming(c, o.address, o.createdAt - 120_000); } catch { throw new HttpError(502, 'network_unavailable'); }
  const hit = hits.find(h => h.confirmed && h.amount === BigInt(o.expected) && h.ts >= o.createdAt - 120_000);
  if (!hit) return payView(id, o);
  try {
    await db.runTransaction(async tx => {
      const cur = (await tx.get(ref)).data(); if (!cur || (cur.status !== 'awaiting' && !(cur.status === 'expired' && cur.deposit))) return;
      tx.create(db.doc(`used_txids/${o.cur}_${hit.txid}`), { payOrderId: id, scope: 'scarab', createdAt: Date.now() });   // un même transfert ne paie jamais deux fois
      tx.update(ref, { status: 'paid', txid: hit.txid, paidAt: Date.now(), ...(cur.status === 'expired' ? { late: true } : {}) });
    });
  } catch { throw new HttpError(409, 'tx_already_used'); }
  await fulfillPayOrder(id).catch(e => warn('scarab.fulfill_failed', { payOrderId: id, message: (e as Error).message }));
  return payView(id, (await ref.get()).data()!);
}
