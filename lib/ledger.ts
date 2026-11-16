import { FieldValue, Transaction } from 'firebase-admin/firestore';
import { db } from './firebase-admin';
// Ecritures en partie double : somme des debits == somme des credits, sinon refus.
export type Line = { account: string; dir: 'debit' | 'credit'; amount: number };
export function postEntry(tx: Transaction, id: string, merchantId: string, type: string, lines: Line[], meta: object = {}) {
  const d = lines.filter(l => l.dir === 'debit').reduce((a, l) => a + l.amount, 0);
  const c = lines.filter(l => l.dir === 'credit').reduce((a, l) => a + l.amount, 0);
  if (d !== c || lines.some(l => !Number.isInteger(l.amount) || l.amount < 0)) throw new Error('unbalanced_entry');
  // create() echoue si l'id existe deja : garantit l'idempotence (un meme evenement ne s'applique qu'une fois)
  tx.create(db.doc(`ledger_entries/${id}`), { merchantId, type, lines, ...meta, createdAt: FieldValue.serverTimestamp() });
}
export const balRef = (m: string) => db.doc(`balances/${m}`);
export async function readBal(tx: Transaction, m: string) {
  const s = await tx.get(balRef(m));
  return { available: 0, reserved: 0, totalReceived: 0, totalWithdrawn: 0, feesPaid: 0, ...(s.data() ?? {}) } as Record<string, number>;
}
export function writeBal(tx: Transaction, m: string, b: Record<string, number>) {
  tx.set(balRef(m), { ...b, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}
