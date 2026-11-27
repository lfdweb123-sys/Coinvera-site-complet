import { db } from '../firebase-admin';
// Nouveautés de la plateforme transmises automatiquement à Coinvera AI (compte et visiteurs) : plus besoin de réécrire les prompts à chaque évolution.
// Deux sources fusionnées, les plus récentes d'abord :
//  1. UPDATES ci-dessous : une entrée par nouveauté (date, titre, texte) ajoutée au code avec la fonctionnalité ;
//  2. collection Firestore « kb_updates » : entrées ajoutées par l'administrateur (Admin > Nouveautés IA) sans redéploiement, désactivables.
// Les entrées « public: false » ne sont données qu'à l'assistant du tableau de bord (jamais aux visiteurs).
export type Update = { date: string; title: string; text: string; public?: boolean };
export const UPDATES: Update[] = [
  { date: '2026-11-27', title: 'Alertes automatiques en cas de problème', text: 'Si une page plante ou si une erreur serveur survient, l’équipe Coinvera et le support sont prévenus automatiquement par e-mail. Vous pouvez réessayer, et écrire au support via la page Contact si le problème persiste.', public: true },
  { date: '2026-11-27', title: 'Recharge du solde par Mobile Money', text: 'Balances > « Recharger mon solde » : en plus de la crypto, paiement par Mobile Money ou virement (FeexPay). Le montant demandé est ajouté au solde disponible ; limite de 2 000 000 FCFA par transaction.', public: true },
  { date: '2026-11-27', title: 'Menu Produits et retour après connexion', text: 'Le site a un menu « Produits » (Numéros WhatsApp et Telegram, ProxNum, eSIM). Après une déconnexion, la reconnexion ramène à la page où l’on était. Le thème Clair/Système/Sombre se choisit dans le menu du profil.', public: true },
  { date: '2026-11-26', title: 'Page Mes cartes', text: 'Toutes les cartes (standard et Virtuals cards pro) s’affichent en cartes, dans deux sections, avec Afficher la carte, Recharger, Geler/Dégeler et Gérer. Le titulaire d’une carte pro est celui renvoyé par l’émetteur.' },
  { date: '2026-11-26', title: 'Recharge du solde en crypto et retraits à valider', text: 'Balances > « Recharger mon solde » : montant de 5 à 10 000 $, adresse de la plateforme, montant exact unique valable 60 minutes, paiements tardifs crédités jusqu’à 7 jours. Les retraits vers une adresse peuvent être validés manuellement (statut « À valider »).' },
  { date: '2026-11-25', title: 'Mobile Money pour les cartes', text: 'Achat et recharge des cartes standard et Pro par Mobile Money ou virement (FCFA, Naira) ; crédit réservé aux cartes. Dépôts crypto Pro tardifs crédités pendant 7 jours.', public: true },
];
const TTL = 5 * 60_000; let cache: { at: number; rows: Update[] } | null = null;
const fresh = (u: Partial<Update>): u is Update => typeof u.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(u.date) && typeof u.title === 'string' && !!u.title.trim() && typeof u.text === 'string' && !!u.text.trim();
/** Nouveautés fusionnées (code + admin), les plus récentes d'abord. Mises en cache 5 minutes ; une panne Firestore laisse seulement les entrées du code. */
export async function recentUpdates(limit = 20, now = Date.now()): Promise<Update[]> {
  if (!cache || now - cache.at > TTL) {
    let extra: Update[] = [];
    try { extra = (await db.collection('kb_updates').where('active', '==', true).limit(100).get()).docs.map(d => d.data() as Partial<Update>).filter(fresh).map(u => ({ date: u.date, title: u.title.trim().slice(0, 120), text: u.text.trim().slice(0, 600), public: u.public === true })); } catch { /* source admin indisponible */ }
    cache = { at: now, rows: [...extra, ...UPDATES].sort((a, b) => b.date.localeCompare(a.date)) };
  }
  return cache.rows.slice(0, limit);
}
export const resetUpdatesCache = () => { cache = null; };
/** Bloc de texte à placer dans un prompt système. */
export async function updatesBlock(audience: 'account' | 'visitor'): Promise<string> {
  const rows = (await recentUpdates(25)).filter(u => audience === 'account' || u.public);
  if (!rows.length) return '';
  return `NOUVEAUTÉS RÉCENTES (les plus récentes d'abord ; elles priment sur la base d'aide en cas de différence ; ne cite jamais une date ou un détail qui n'est pas écrit ici)\n${rows.map(u => `- [${u.date}] ${u.title} : ${u.text}`).join('\n')}`;
}
