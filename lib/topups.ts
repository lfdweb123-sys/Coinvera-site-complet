import crypto from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebase-admin';
import { HttpError } from './auth';
import { addrOf, available, byId, Cur, fmt, networkWarning } from './cryptos';
import { Hit, scanIncoming, verifyEvmNative } from './chains';
import { priceUsd } from './price';
import { postEntry, readBal, writeBal } from './ledger';
import { fromUnits, toUnits } from './money';
import { reserveAmount } from './pay-amounts';
import { notify } from './audit';
import { alertAdmins } from './admin-alert';
import { merchantEmail } from './audit';
import { receiptTopup } from './receipt-events';
import { info, warn } from './log';
// Recharge du SOLDE Coinvera (disponible, retirable) en crypto, sur les adresses de la plateforme définies dans les variables d'environnement PAY_ADDR_*.
// Même sécurité que les paiements d'activation : montant exact unique par commande (aucun paiement ne peut être attribué à un autre), un transfert ne sert qu'une fois (used_txids),
// confirmation lue sur la chaîne. Un paiement tardif (après l'expiration) reste crédité pendant 7 jours : l'argent reçu n'est jamais perdu.
export const TOPUP_MIN = 5, TOPUP_MAX = 10_000, VALID_MS = 60 * 60_000, GRACE_MS = 7 * 24 * 3600_000, MAX_OPEN = 5;
export const options = () => available().map(c => ({ id: c.id, sym: c.sym, net: c.net, name: c.name, scan: c.scan, warning: networkWarning(c) }));
export const view = (id: string, o: any) => ({ id, cur: o.cur, net: byId(o.cur)?.net ?? '', status: o.status, address: o.address, amount: fmt(BigInt(o.expected), o.decimals), amountUsd: fromUnits(o.usd), expiresAt: o.expiresAt, txid: o.txid ?? null, scan: byId(o.cur)?.scan ?? false });
export async function createTopup(uid: string, curId: string, amount: string) {
  const c = byId(curId); if (!c || !addrOf(c)) throw new HttpError(400, 'currency_unavailable');
  const usd = toUnits(amount); if (!(usd >= TOPUP_MIN * 1e6 && usd <= TOPUP_MAX * 1e6)) throw new HttpError(400, 'invalid_amount');
  const mine = (await db.collection('balance_topups').where('merchantId', '==', uid).where('status', '==', 'awaiting').get()).docs.filter(d => d.data().expiresAt > Date.now());
  if (mine.length >= MAX_OPEN) throw new HttpError(429, 'too_many_pending');
  let base: bigint;
  if (c.stable) base = BigInt(Math.round(usd / 1e6 * 10 ** c.decimals));
  else { let p: number; try { p = await priceUsd(c.cg!); } catch { throw new HttpError(503, 'quote_unavailable'); } base = BigInt(Math.ceil(usd / 1e6 / p * 10 ** c.decimals)); }
  const span = c.stable ? BigInt(Math.max(1, Math.floor(0.009 * 10 ** c.decimals))) : base / 1000n + 1n;
  const taken = new Set<string>();   // montants déjà attendus sur cette adresse (recharges en attente ou expirées surveillées 7 jours, activations)
  for (const [col, sts] of [['balance_topups', ['awaiting', 'expired']], ['crypto_orders', ['awaiting']]] as const) for (const st of sts) (await db.collection(col).where('cur', '==', c.id).where('status', '==', st).get()).docs.forEach(d => taken.add(String(d.data().expected)));
  let expected = 0n;
  for (let i = 0; i < 50; i++) { const cand = base + BigInt(crypto.randomInt(1, Number(span > 1_000_000_000n ? 1_000_000_000n : span) + 1)); if (!taken.has(cand.toString()) && await reserveAmount('topup', c.id, cand.toString(), Date.now() + GRACE_MS + 3600_000)) { expected = cand; break; } }
  if (!expected) throw new HttpError(503, 'network_unavailable');
  const ref = db.collection('balance_topups').doc(); const now = Date.now();
  const o = { merchantId: uid, cur: c.id, address: addrOf(c), decimals: c.decimals, usd, expected: expected.toString(), status: 'awaiting', createdAt: now, expiresAt: now + VALID_MS };
  await ref.set({ ...o, createdAtTs: FieldValue.serverTimestamp() }); info('topup.created', { topupId: ref.id, merchantId: uid, cur: c.id, usd }); return view(ref.id, o);
}
// Crédit unique : la transition de statut, le transfert consommé et l'écriture comptable sont dans la même transaction ; l'identifiant d'écriture est fixe.
async function credit(id: string, hit: Pick<Hit, 'txid' | 'amount'>, late: boolean) {
  let uid = '', usd = 0;
  const ok = await db.runTransaction(async tx => {
    const r = db.doc(`balance_topups/${id}`); const o = (await tx.get(r)).data(); if (!o || o.status === 'confirmed') return false;
    uid = o.merchantId; usd = o.usd; const bal = await readBal(tx, uid);
    tx.create(db.doc(`used_txids/${o.cur}_${hit.txid.replace(/\//g, '_')}`), { topupId: id, createdAt: Date.now() });   // un même transfert ne sert qu'une fois
    postEntry(tx, `topup_${id}`, uid, 'topup', [{ account: 'central:funds', dir: 'debit', amount: usd }, { account: `merchant:${uid}:available`, dir: 'credit', amount: usd }], { topupId: id, cur: o.cur, late });
    writeBal(tx, uid, { ...bal, available: bal.available + usd });
    tx.update(r, { status: 'confirmed', txid: hit.txid, received: hit.amount.toString(), late, confirmedAt: Date.now() }); return true;
  });
  if (ok) { info('topup.confirmed', { topupId: id, merchantId: uid, usd, late });
    await notify(uid, 'Solde rechargé', `${fromUnits(usd).replace(/0+$/, '').replace(/\.$/, '')} $ ont été ajoutés à votre solde disponible.`).catch(() => {}); await receiptTopup(id);
    const o = (await db.doc(`balance_topups/${id}`).get()).data()!; void merchantEmail(uid).catch(() => '').then(who => alertAdmins(`Recharge de solde : ${fromUnits(usd)} $`, ['Une recharge de solde par adresse vient d’être créditée automatiquement après confirmation sur la chaîne.'], [['Utilisateur', who || uid], ['Crypto', `${byId(o.cur)?.name ?? o.cur}`], ['Montant crédité', `${fromUnits(usd)} $`], ['Transaction', String(o.txid)], ['Recharge', id], ...(late ? [['Remarque', 'paiement reçu après expiration'] as [string, string]] : [])])); }
  return ok;
}
export async function checkTopup(uid: string | null, id: string, txid?: string) {
  const ref = db.doc(`balance_topups/${id}`); let o = (await ref.get()).data();
  if (!o || (uid && o.merchantId !== uid)) throw new HttpError(404, 'not_found');
  if (o.status === 'confirmed' || o.status === 'closed') return view(id, o);
  const now = Date.now();
  if (o.status === 'awaiting' && o.expiresAt < now) { await ref.update({ status: 'expired' }); o = { ...o, status: 'expired' }; }
  if (o.status === 'expired' && o.createdAt + GRACE_MS < now) { await ref.update({ status: 'closed' }); return view(id, { ...o, status: 'closed' }); }
  const c = byId(o.cur) as Cur; const expected = BigInt(o.expected); let hits: Hit[] = [];
  try { hits = c.scan ? await scanIncoming(c, o.address, o.createdAt - 120_000) : txid ? [await verifyEvmNative(c, txid, o.address)].filter(Boolean) as Hit[] : []; }
  catch { throw new HttpError(502, 'network_unavailable'); }
  if (txid) hits = hits.filter(h => h.txid.toLowerCase() === txid.trim().toLowerCase());
  const hit = hits.find(h => h.confirmed && h.amount === expected && h.ts >= o.createdAt - 120_000);
  if (!hit) { if (txid) warn('topup.verify_no_match', { topupId: id, cur: o.cur, hits: hits.length }); return view(id, o); }
  try { await credit(id, hit, o.status === 'expired'); } catch (e) { warn('topup.confirm_failed', { topupId: id, message: (e as Error).message }); throw new HttpError(409, 'tx_already_used'); }
  return view(id, (await ref.get()).data()!);
}
export async function pollTopups() {
  let n = 0;
  for (const st of ['awaiting', 'expired']) for (const d of (await db.collection('balance_topups').where('status', '==', st).limit(100).get()).docs) { if (!byId(d.data().cur)?.scan) continue; try { await checkTopup(null, d.id); n++; } catch (e) { warn('cron.topup_item_failed', { id: d.id, message: (e as Error).message }); } }
  return n;
}
