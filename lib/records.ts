import { db } from './firebase-admin';
// Règles communes de suppression / révocation (côté utilisateur et côté admin).
// Transactions : une transaction RÉUSSIE n'est jamais supprimable. Une transaction encore « en attente » est seulement MASQUÉE (hidden) et non effacée :
// si le client paie après coup, le crédit du marchand (settlePayment) a toujours besoin du document. Les échecs / expirations sont réellement supprimés.
export const TX_SUCCESS = ['confirmed', 'completed', 'succeeded', 'success', 'paid', 'settled'];
export const TX_DEAD = ['failed', 'expired', 'cancelled', 'canceled', 'rejected'];
export type Outcome = { id: string; result: 'deleted' | 'hidden' | 'skipped'; reason?: string };
export async function removeTransaction(id: string, d: Record<string, any>): Promise<Outcome> {
  if (TX_SUCCESS.includes(String(d.status))) return { id, result: 'skipped', reason: 'transaction_successful' };
  if (TX_DEAD.includes(String(d.status))) { await db.doc(`transactions/${id}`).delete(); return { id, result: 'deleted' }; }
  await db.doc(`transactions/${id}`).update({ hidden: true, hiddenAt: new Date() }); return { id, result: 'hidden' };
}
