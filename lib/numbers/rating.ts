import { HttpError } from '../auth';
import { db } from '../firebase-admin';
// Système de note de la documentation 5sim (section « Rating »), appliqué à CHAQUE utilisateur de Coinvera pour protéger la note du compte partagé :
//   note initiale et maximale : 96 points ;  recharge du solde +8 ;  achat terminé avant la fin du délai +0,5 ;  achat terminé automatiquement après le délai +0,4 ;
//   expiration (timeout) −0,15 ;  achat annulé −0,1 ;  numéro envoyé au ban −0,1.
//   Si la note tombe à zéro : aucun achat pendant 24 heures, puis la note revient à 96.
// Calculs en centièmes de point (entiers) : aucune erreur d'arrondi flottant.
export const MAX = 9600, BLOCK_MS = 24 * 3600_000;
export const POINTS = { replenish: 800, completedEarly: 50, completedLate: 40, timeout: -15, canceled: -10, banned: -10 } as const;
export type RatingEvent = keyof typeof POINTS;
export type RatingState = { rating: number; blockedUntil: number };
const ref = (uid: string) => db.doc(`fivesim_users/${uid}`);
/** État lu en base : absent = 96 ; bloqué et 24 h écoulées = remis à 96. */
export function normalize(d: any, now: number): RatingState {
  const blockedUntil = Number(d?.blockedUntil) || 0;
  if (blockedUntil && now >= blockedUntil) return { rating: MAX, blockedUntil: 0 };
  const r = Number(d?.rating); return { rating: Number.isFinite(r) ? Math.min(MAX, Math.max(0, Math.round(r))) : MAX, blockedUntil };
}
/** Applique un événement. Pendant le blocage de 24 h la note ne bouge plus (elle reviendra à 96 d'un coup). */
export function apply(s: RatingState, ev: RatingEvent, now: number): RatingState {
  if (s.blockedUntil > now) return s;
  const r = Math.min(MAX, s.rating + POINTS[ev]);
  return r <= 0 ? { rating: 0, blockedUntil: now + BLOCK_MS } : { rating: r, blockedUntil: 0 };
}
export const view = (s: RatingState) => ({ rating: s.rating / 100, max: MAX / 100, blockedUntil: s.blockedUntil || null });
export async function readState(uid: string, now = Date.now()) { return normalize((await ref(uid).get()).data(), now); }
/** Refuse l'achat tant que la note est à zéro (24 h). */
export async function assertCanOrder(uid: string, now = Date.now()) { if ((await readState(uid, now)).blockedUntil > now) throw new HttpError(429, 'rating_blocked'); }
// Version transactionnelle : la note change dans la MÊME transaction que le règlement ou le remboursement, donc une seule fois par commande.
export async function txRead(tx: any, uid: string, now: number) { return normalize((await tx.get(ref(uid))).data(), now); }
export function txWrite(tx: any, uid: string, s: RatingState, now: number) { tx.set(ref(uid), { rating: s.rating, blockedUntil: s.blockedUntil, updatedAt: now }, { merge: true }); }
/** Recharge du solde : +8 points (plafonnés à 96). */
export async function replenish(uid: string, now = Date.now()) { await db.runTransaction(async tx => { const s = await txRead(tx, uid, now); txWrite(tx, uid, apply(s, 'replenish', now), now); }); }
