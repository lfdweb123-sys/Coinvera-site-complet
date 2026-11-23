import { db } from './firebase-admin';
// Réservation ATOMIQUE d'un montant d'identification (cur + adresse + montant exact) : deux commandes simultanées ne peuvent jamais recevoir le même montant,
// donc un paiement ne peut jamais être attribué à la mauvaise personne. La réservation expire avec la surveillance de l'ordre.
export async function reserveAmount(scope: string, cur: string, expected: string, untilMs: number): Promise<boolean> {
  const ref = db.doc(`pay_amounts/${scope}_${cur}_${expected}`);
  return db.runTransaction(async tx => { const s = await tx.get(ref); if (s.exists && (s.data()!.until ?? 0) > Date.now()) return false; tx.set(ref, { until: untilMs, createdAt: Date.now() }); return true; });
}
