import { seo } from '@/lib/seo';
import { Clock, Gift, ListChecks, Repeat, RotateCcw, ShieldCheck } from 'lucide-react';
import PluginPage, { Frame } from '@/components/PluginPage';
import { getSettings } from '@/lib/settings';
export const revalidate = 300;
export const metadata = seo({ title: 'Plugin retours & échanges pour WooCommerce', description: 'Portail client en libre-service pour les retours et échanges WooCommerce : avoir immédiat avec bonus ou remboursement validé par vos soins. Même licence que les autres plugins.', path: '/retours', keywords: ['retours WooCommerce', 'échange produit WooCommerce', 'avoir boutique en ligne', 'remboursement WooCommerce', 'plugin retour marchandise WordPress'] });
const F = [
  [RotateCcw, 'Demande en 2 clics', 'Le client choisit sa commande, les articles concernés et la raison, directement depuis Mon compte.'],
  [Gift, 'Avoir immédiat avec bonus', 'Un bon d’achat est généré et envoyé par e-mail à l’instant, avec un bonus (taux réglable) qui encourage l’avoir plutôt que le remboursement.'],
  [Repeat, 'Remboursement ou échange', 'Ces deux options restent soumises à votre validation : vous gardez la main sur les sorties d’argent.'],
  [Clock, 'Fenêtre de retour réglable', 'Basée sur la date de livraison connue de la commande.'],
  [ShieldCheck, 'Pas de double réclamation', 'Impossible de réclamer plus d’articles que ce qui a été acheté, même en plusieurs demandes.'],
  [ListChecks, 'Journal complet', 'Chaque demande est tracée, avec export et effacement RGPD.'],
] as const;
const STEPS = [['Installez WooCommerce si ce n’est pas déjà fait', 'Coinvera Returns s’appuie sur vos commandes WooCommerce existantes.'], ['Installez le fichier ZIP dans WordPress', 'Extensions → Ajouter → Téléverser, puis activez.'], ['Saisissez votre licence', 'Coinvera Returns → Réglages. L’onglet « Retours » apparaît automatiquement dans Mon compte.'], ['Ajustez le bonus et le délai', 'Taux de l’avoir, durée de validité, délai de retour : tout est réglable.']] as const;
const FAQ = [
  ['Une vérification d’identité est-elle demandée ?', 'Non. Aucune vérification d’identité (KYC) n’est demandée pour créer un compte Coinvera, utiliser ce plugin, encaisser des paiements ou retirer vos fonds. Seule exception : les cartes virtuelles, dont l’émetteur partenaire exige l’identité du titulaire.'],
  ['Le remboursement est-il automatique ?', 'Non, et c’est volontaire : ce plugin fonctionne avec n’importe quelle passerelle de paiement, il ne peut donc pas déclencher lui-même un remboursement réel. La demande vous est soumise ; l’approuver enregistre le remboursement sur la commande, mais le mouvement d’argent reste sous votre responsabilité si votre passerelle ne le fait pas automatiquement.'],
  ['Comment fonctionne l’avoir ?', 'C’est un bon d’achat WooCommerce classique, à usage unique, réservé à l’adresse e-mail du client, avec une durée de validité réglable. Il est émis immédiatement, sans aucune action de votre part.'],
  ['Puis-je refuser une demande ?', 'Oui, en un clic depuis le tableau de bord, avec une note interne si besoin.'],
  ['Faut-il une licence supplémentaire ?', 'Non, c’est la même licence que les autres plugins Coinvera.'],
] as const;
const CODE = `Client (Mon compte → Retours) :
  sélectionne les articles + la raison
  choisit : avoir (+bonus, immédiat) / remboursement / échange

Avoir → bon d'achat généré et envoyé par e-mail, instantané
Remboursement / échange → en attente, visible dans votre tableau de bord
  → vous approuvez ou refusez`;
export default async function P() { const s = await getSettings();
  return <PluginPage eyebrow="Plugin retours & échanges" title="Un portail retours en libre-service, sans perdre la main sur les remboursements" sub="Vos clients demandent un retour ou un échange en deux clics ; l’avoir immédiat avec bonus réduit vos remboursements, et vous validez vous-même ce qui touche à l’argent."
    price={s.apiActivationUsd} features={F} steps={STEPS} priceNote="Un seul paiement unique : API de production et tous les plugins Coinvera, avec la même licence."
    bullets={['Même licence unique que les autres plugins', 'Bonus et délais entièrement réglables', 'Fonctionne avec toute passerelle WooCommerce', 'Mises à jour du plugin']}
    previewTitle="Aperçu du formulaire client" preview={<Frame><div style={{ display: 'flex', justifyContent: 'space-between' }}><b>Commande #1042</b><span className="mut">Mon compte → Retours</span></div>
      <p style={{ margin: '12px 0' }}>☑ T-shirt bleu, taille M — Qté 1</p>
      <p style={{ margin: '0 0 12px', padding: 10, borderRadius: 8, background: '#E8F6EC' }}>● Avoir à utiliser sur une prochaine commande <strong>(+5 %, émis immédiatement)</strong></p>
      <p className="mut" style={{ margin: 0 }}>Exemple fictif.</p></Frame>}
    codeTitle="Comment ça fonctionne" code={CODE} faq={FAQ} />; }
