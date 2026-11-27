import { db } from '../firebase-admin';
import type { Pricing } from './pricing';
// Réglages Virtuals cards pro (collection à part). `enabled` est faux par défaut : rien n'est proposé tant que l'administrateur n'a pas activé le service.
// Marge Coinvera au-dessus du tarif Starter. issue* : à la création (sur le solde d'ouverture). load* : à chaque recharge. Défauts : 2,00 $ + 2,5 % à la création, 0,50 $ + 2,5 % par recharge (modifiables en admin ; 0 = prix coûtant Starter).
export const SCARAB_DEFAULTS = { enabled: false, issueFlat: 2, issueBps: 250, loadFlat: 0.5, loadBps: 250, hidden: [] as string[],
  // Adresse de facturation à indiquer lors des paiements en ligne avec ces cartes (AVS). Reprise de l'affichage du prestataire ; modifiable en admin.
  billingAddress: '3401 N. Miami Ave. Ste 230\nMiami, Florida 33127\nUnited States' };   // confirmée par le support : identique pour toutes les cartes (virtuelle, sans contact, Platinum)
export type ScarabSettings = typeof SCARAB_DEFAULTS;
export async function scarabSettings(): Promise<ScarabSettings> {
  try { const x = { ...SCARAB_DEFAULTS, ...((await db.doc('scarab_settings/config').get()).data() ?? {}) }; x.billingAddress = String(x.billingAddress ?? '').replace('N. Miami, Ave.', 'N. Miami Ave.'); return x; } catch { return { ...SCARAB_DEFAULTS }; }
}
export const pricingOf = (s: ScarabSettings): Pricing => ({
  issue: { flatMinor: Math.round(Number(s.issueFlat) * 100), bps: Math.round(Number(s.issueBps)) },
  topup: { flatMinor: Math.round(Number(s.loadFlat) * 100), bps: Math.round(Number(s.loadBps)) },
});
