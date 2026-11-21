import { db } from '../firebase-admin';
import { bps, toUnits } from '../money';
// Réglages du module cartes (collection à part). `enabled` est faux par défaut : rien n'est proposé tant que l'administrateur n'a pas activé le service.
// refundAdvance : à la fermeture effective d'une carte, l'utilisateur est crédité tout de suite sur une estimation fiable ; l'écart est réglé à l'arrivée du remboursement réel.
export const CARD_DEFAULTS = { enabled: false, refundAdvance: true, issueFlat: 1, issueBps: 0, loadFlat: 0, loadBps: 100 };
export type CardSettings = typeof CARD_DEFAULTS;
export async function cardSettings(): Promise<CardSettings> {
  try { return { ...CARD_DEFAULTS, ...((await db.doc('card_settings/config').get()).data() ?? {}) }; } catch { return { ...CARD_DEFAULTS }; }
}
// Marge Coinvera (en unités 1e-6 USD), ajoutée au total facturé par le prestataire. issue : sur le solde d'ouverture ; topup : sur le montant rechargé.
export const markupOf = (s: CardSettings, kind: 'issue' | 'topup', amountUnits: number) =>
  kind === 'issue' ? toUnits(s.issueFlat) + bps(amountUnits, s.issueBps) : toUnits(s.loadFlat) + bps(amountUnits, s.loadBps);
