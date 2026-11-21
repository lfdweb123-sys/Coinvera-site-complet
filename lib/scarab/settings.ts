import { db } from '../firebase-admin';
import type { Pricing } from './pricing';
// Réglages Carte Pro (collection à part). `enabled` est faux par défaut : rien n'est proposé tant que l'administrateur n'a pas activé le service.
// Marge Coinvera au-dessus du tarif Starter. issue* : à la création (sur le solde d'ouverture). load* : à chaque recharge. Marge 0 = vente au prix coûtant Starter.
export const SCARAB_DEFAULTS = { enabled: false, issueFlat: 0, issueBps: 0, loadFlat: 0, loadBps: 0, hidden: [] as string[] };
export type ScarabSettings = typeof SCARAB_DEFAULTS;
export async function scarabSettings(): Promise<ScarabSettings> {
  try { return { ...SCARAB_DEFAULTS, ...((await db.doc('scarab_settings/config').get()).data() ?? {}) }; } catch { return { ...SCARAB_DEFAULTS }; }
}
export const pricingOf = (s: ScarabSettings): Pricing => ({
  issue: { flatMinor: Math.round(Number(s.issueFlat) * 100), bps: Math.round(Number(s.issueBps)) },
  topup: { flatMinor: Math.round(Number(s.loadFlat) * 100), bps: Math.round(Number(s.loadBps)) },
});
