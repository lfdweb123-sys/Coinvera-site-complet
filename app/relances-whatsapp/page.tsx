import { BellRing, Clock, Link2, ListChecks, MessageCircle, ShieldCheck } from 'lucide-react';
import PluginPage, { Frame } from '@/components/PluginPage';
import { getSettings } from '@/lib/settings';
export const revalidate = 300;
export const metadata = { title: 'Plugin de relance WhatsApp WordPress', description: 'Relancez automatiquement vos commandes WooCommerce en attente de paiement et notifiez vos clients par WhatsApp. Même licence que les autres plugins Coinvera.', alternates: { canonical: '/relances-whatsapp' } };
const F = [
  [Clock, 'Relance après un délai réglable', 'Une commande restée en attente de paiement reçoit un rappel WhatsApp avec un lien de paiement direct, après le délai de votre choix.'],
  [BellRing, 'Notifications de statut', 'Vos clients sont prévenus par WhatsApp à chaque changement de statut que vous activez : en cours, terminée, annulée, remboursée...'],
  [MessageCircle, 'Aucun compte WhatsApp à créer', 'L’envoi passe par le compte Coinvera, avec la même licence que vos autres plugins : rien à configurer côté Meta.'],
  [ShieldCheck, 'Consentement intégré', 'Case à cocher au moment du paiement pour la relance panier, conforme aux règles de Meta sur les messages marketing.'],
  [Link2, 'Lien de paiement direct', 'Le client retrouve sa commande en un clic, sans ressaisir son panier.'],
  [ListChecks, 'Journal des envois', 'Chaque relance (envoyée, ignorée ou échouée) est journalisée, sans jamais stocker vos données clients dans le plugin.'],
] as const;
const STEPS = [['Installez WooCommerce si ce n’est pas déjà fait', 'Coinvera Reminders s’appuie sur les commandes WooCommerce existantes.'], ['Installez le fichier ZIP dans WordPress', 'Extensions → Ajouter → Téléverser, puis activez.'], ['Saisissez votre licence et votre clé API', 'Coinvera Reminders → Réglages. Les mêmes identifiants que vos autres plugins Coinvera.'], ['Choisissez le délai et les statuts à notifier', 'Tout est réglable sans toucher au code.']] as const;
const FAQ = [
  ['Une vérification d’identité est-elle demandée ?', 'Non. Aucune vérification d’identité (KYC) n’est demandée pour créer un compte Coinvera, utiliser ce plugin, encaisser des paiements ou retirer vos fonds. Seule exception : les cartes virtuelles, dont l’émetteur partenaire exige l’identité du titulaire.'],
  ['Faut-il créer un compte WhatsApp Business ?', 'Non. L’envoi passe par le compte Coinvera, partagé par tous les marchands : vous n’avez ni compte à créer ni jeton à configurer.'],
  ['Le client doit-il donner son accord ?', 'Pour la relance panier, oui : une case à cocher au moment du paiement, car Meta classe ce type de message en « marketing ». Les notifications de statut, liées à une commande existante, n’en ont pas besoin.'],
  ['Que se passe-t-il si le client paie entre-temps ?', 'La relance ne part que si la commande est toujours en attente au moment de l’envoi ; une fois payée, plus aucune relance n’est envoyée pour cette commande.'],
  ['Mes données clients sont-elles stockées par le plugin ?', 'Non. Le plugin ne conserve que le résultat de l’envoi (réussi, ignoré, échoué) ; le numéro de téléphone est lu depuis la commande au moment de l’envoi, jamais archivé.'],
  ['Faut-il une licence supplémentaire ?', 'Non, c’est la même licence que les autres plugins Coinvera.'],
] as const;
const CODE = `Commande créée, en attente de paiement
  → délai écoulé + consentement donné + téléphone présent ?
  → oui : WhatsApp « Vous avez laissé une commande chez {{boutique}}, finalisez ici : {{lien}} »
  → commande payée entre-temps : aucune relance envoyée

Commande "terminée" / "annulée" / "remboursée"...
  → WhatsApp « Votre commande chez {{boutique}} est {{statut}} »`;
export default async function P() { const s = await getSettings();
  return <PluginPage eyebrow="Plugin relances WhatsApp" title="Récupérez vos commandes en attente, par WhatsApp" sub="Relancez automatiquement les commandes WooCommerce restées en attente de paiement et tenez vos clients informés de leur statut, sans compte WhatsApp à gérer."
    price={s.apiActivationUsd} features={F} steps={STEPS} priceNote="Un seul paiement unique : API de production et tous les plugins Coinvera, avec la même licence."
    bullets={['Même licence unique que les autres plugins', 'Aucun compte WhatsApp Business à créer', 'Délai et statuts entièrement réglables', 'Mises à jour du plugin']}
    previewTitle="Exemple de relance" preview={<Frame><div style={{ display: 'flex', justifyContent: 'space-between' }}><b>WhatsApp</b><span className="mut">À l’instant</span></div>
      <p style={{ margin: '12px 0', padding: 12, borderRadius: 10, background: '#DCF8C6' }}>Bonjour, vous avez laissé des articles dans votre panier chez Boutique Exemple. Finalisez votre commande ici : coinvera.me/pay/abc123</p>
      <p className="mut" style={{ margin: 0 }}>Exemple fictif.</p></Frame>}
    codeTitle="Comment ça fonctionne" code={CODE} faq={FAQ} />; }
