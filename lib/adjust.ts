import { db } from './firebase-admin';
import { HttpError } from './auth';
import { postEntry, readBal, writeBal } from './ledger';
import { SCALE, toUnits } from './money';
// Ajustement manuel des soldes tenus par Coinvera pour un marchand (crédit ou retrait) : solde disponible, crédit cartes virtuelles, crédit Virtuals cards pro.
// Jamais les soldes chez un fournisseur (cartes, Rivoner), ni les montants « réservés » (retraits ou commandes en cours) : ils sont liés à une opération précise qui les solde elle-même.
// Toujours en partie double dans le registre immuable (compte « platform:adjustments » en contrepartie), jamais une simple modification du solde :
// la réconciliation (somme des soldes == somme du registre) reste exacte, et chaque opération garde un identifiant, l'auteur et le motif.
export const MAX_ADJUST_USD = 100_000;
export type Direction = 'credit' | 'debit';
export const POOLS = ['available', 'card_credit', 'scarab_credit'] as const;
export type Pool = (typeof POOLS)[number];
export const POOL_LABEL: Record<Pool, string> = { available: 'solde disponible', card_credit: 'crédit cartes virtuelles', scarab_credit: 'crédit Virtuals cards pro' };
export async function adjustBalance(p: { adminUid: string; merchantId: string; pool?: Pool; direction: Direction; amount: string; reason: string }) {
  const pool: Pool = p.pool ?? 'available'; if (!POOLS.includes(pool)) throw new HttpError(400, 'invalid_request');
  const amt = toUnits(p.amount); if (!Number.isInteger(amt) || amt <= 0 || amt > MAX_ADJUST_USD * SCALE) throw new HttpError(400, 'amount_out_of_limits');
  const ref = db.collection('admin_adjustments').doc(); let before = 0, after = 0;
  await db.runTransaction(async tx => {
    if (!(await tx.get(db.doc(`merchants/${p.merchantId}`))).exists) throw new HttpError(404, 'not_found');
    if ((await tx.get(db.doc(`admins/${p.merchantId}`))).exists) throw new HttpError(403, 'protected_admin');   // un administrateur n'est jamais un marchand
    const bal = await readBal(tx, p.merchantId); before = bal[pool] ?? 0;
    if (p.direction === 'debit' && before < amt) throw new HttpError(400, 'insufficient_balance');          // le solde ne devient jamais négatif
    const m = `merchant:${p.merchantId}:${pool}`;
    postEntry(tx, `admin_adj_${ref.id}`, p.merchantId, 'admin_adjustment', p.direction === 'credit'
      ? [{ account: 'platform:adjustments', dir: 'debit', amount: amt }, { account: m, dir: 'credit', amount: amt }]
      : [{ account: m, dir: 'debit', amount: amt }, { account: 'platform:adjustments', dir: 'credit', amount: amt }],
      { adjustmentId: ref.id, pool, direction: p.direction, reason: p.reason, adminUid: p.adminUid });
    after = p.direction === 'credit' ? before + amt : before - amt; writeBal(tx, p.merchantId, { ...bal, [pool]: after });
    tx.set(ref, { merchantId: p.merchantId, adminUid: p.adminUid, pool, direction: p.direction, amountUnits: amt, reason: p.reason, balanceBefore: before, balanceAfter: after, createdAt: new Date() });
  });
  return { id: ref.id, pool, amountUnits: amt, before, after };
}
