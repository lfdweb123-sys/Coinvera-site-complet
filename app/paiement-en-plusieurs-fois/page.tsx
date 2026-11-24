import { seo } from '@/lib/seo';
import { CalendarClock, Layers, Link2, ListChecks, Lock, Percent } from 'lucide-react';
import PluginPage, { Frame } from '@/components/PluginPage';
import { getSettings } from '@/lib/settings';
export const revalidate = 300;
export const metadata = seo({ title: 'Plugin paiement en plusieurs fois WooCommerce', description: 'Proposez un acompte ou le paiement en 2 ou 3 fois dans votre boutique WooCommerce, géré par vous, avec un lien de paiement envoyé à chaque échéance. Même licence que les autres plugins Coinvera.', path: '/paiement-en-plusieurs-fois', keywords: ['paiement en plusieurs fois WooCommerce', 'acompte WooCommerce', 'paiement en 3 fois', 'paiement fractionné WordPress', 'plugin acompte commande'] });
const F = [
  [Percent, 'Acompte réglable', 'Le client verse une part à la commande (50 % par défaut) et le solde plus tard, par exemple avant la livraison.'],
  [Layers, 'Paiement en 2 ou 3 fois', 'Vous activez les formules que vous voulez, avec un montant minimum de commande. Aucun organisme tiers, aucune condition de crédit.'],
  [Link2, 'Lien de paiement à chaque échéance', 'À la date prévue, le client reçoit un lien par e-mail, et par WhatsApp si vous l’activez, pour régler en carte ou Mobile Money selon vos passerelles.'],
  [Lock, 'Pas d’expédition avant le solde', 'La commande d’origine ne peut pas être terminée tant que tout n’est pas payé. Réglable si vous préférez.'],
  [CalendarClock, 'Rappel et alerte', 'Un rappel unique au client si une échéance reste impayée, et un e-mail d’alerte pour vous.'],
  [ListChecks, 'Suivi des échéances', 'Un tableau des échéances et l’état du plan sur chaque commande : ce qui est payé, ce qui reste dû.'],
] as const;
const STEPS = [['Installez WooCommerce avec le checkout classique', 'Le choix du plan est proposé sur le checkout classique (shortcode).'], ['Installez le fichier ZIP dans WordPress', 'Extensions → Ajouter → Téléverser, puis activez.'], ['Saisissez votre licence', 'Coinvera Installments → Réglages. La clé API n’est nécessaire que pour envoyer aussi les liens par WhatsApp.'], ['Choisissez vos formules et vos délais', 'Acompte, 2 fois, 3 fois, jours entre échéances, blocage de la commande : tout est réglable.']] as const;
const FAQ = [
  ['Une vérification d’identité est-elle demandée ?', 'Non. Aucune vérification d’identité (KYC) n’est demandée pour créer un compte Coinvera, utiliser ce plugin, encaisser des paiements ou retirer vos fonds. Seule exception : les cartes virtuelles, dont l’émetteur partenaire exige l’identité du titulaire.'],
  ['Les échéances sont-elles prélevées automatiquement ?', 'Non. Le client reçoit un lien de paiement à chaque échéance et règle lui-même. Le risque d’impayé reste le vôtre : pour les montants élevés, privilégiez l’acompte et le blocage de la commande jusqu’au solde.'],
  ['Cela fonctionne-t-il avec ma passerelle de paiement ?', 'Oui, avec n’importe quelle passerelle WooCommerce : la commande ne porte que le montant dû maintenant, et chaque échéance est une commande payable normalement.'],
  ['Le checkout en blocs est-il pris en charge ?', 'Pas pour l’instant. Le plugin se déclare incompatible auprès de WooCommerce, et sans choix de plan le paiement reste intégral : jamais de paiement partiel par erreur.'],
  ['Que voit le client sur ses commandes ?', 'La commande d’origine pour l’acompte ou la première échéance, puis une commande par échéance restante, créée à sa date avec son lien de paiement.'],
  ['Que se passe-t-il si la commande est annulée ?', 'Les échéances restantes sont annulées, ainsi que les commandes d’échéance encore en attente de paiement.'],
  ['Faut-il une licence supplémentaire ?', 'Non, c’est la même licence que les autres plugins Coinvera.'],
] as const;
const CODE = `Checkout : le client choisit son mode de règlement
  • totalité maintenant
  • acompte de 50 % maintenant, solde avant la livraison
  • 2 fois ou 3 fois

Acompte ou 1re échéance payé → plan enregistré
À chaque échéance → commande + lien de paiement (e-mail, WhatsApp)
Impayé depuis 3 jours → un rappel, et une alerte pour vous
Tout est payé → la commande peut être terminée et expédiée`;
export default async function P() { const s = await getSettings();
  return <PluginPage eyebrow="Plugin paiement en plusieurs fois" title="Vendez plus cher en laissant vos clients payer en plusieurs fois" sub="Proposez un acompte ou le paiement en 2 ou 3 fois dans votre boutique WooCommerce, géré par vous, sans organisme de crédit et avec un lien de paiement à chaque échéance."
    price={s.apiActivationUsd} features={F} steps={STEPS} priceNote="Un seul paiement unique : API de production et tous les plugins Coinvera, avec la même licence."
    bullets={['Même licence unique que les autres plugins', 'Fonctionne avec toute passerelle WooCommerce', 'Formules, délais et blocage réglables', 'Mises à jour du plugin']}
    previewTitle="Exemple de checkout" preview={<Frame><b>Mode de règlement</b>
      <div style={{ margin: '12px 0', display: 'grid', gap: 8 }}>{['Payer la totalité maintenant (60 000 F)', 'Acompte de 50 % : 30 000 F maintenant, le solde de 30 000 F avant la livraison', 'Payer en 3 fois : 20 000 F maintenant, puis 2 × 20 000 F'].map((x, i) => <label key={x} style={{ display: 'flex', gap: 8 }}><input type="radio" name="demo" defaultChecked={i === 1} readOnly /> {x}</label>)}</div>
      <p className="mut" style={{ margin: 0 }}>Exemple fictif.</p></Frame>}
    codeTitle="Comment ça fonctionne" codeNote="Le parcours d’une commande payée en plusieurs fois." code={CODE} faq={FAQ} />; }
