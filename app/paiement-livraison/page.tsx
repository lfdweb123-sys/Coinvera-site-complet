import { seo } from '@/lib/seo';
import { Gauge, ListChecks, MessageCircle, PackageCheck, PhoneCall, ShieldCheck } from 'lucide-react';
import PluginPage, { Frame } from '@/components/PluginPage';
import { getSettings } from '@/lib/settings';
export const revalidate = 300;
export const metadata = seo({ title: 'Plugin paiement à la livraison WooCommerce', description: 'Réduisez les faux acheteurs et les colis refusés : confirmation de chaque commande par WhatsApp avant expédition et score de fiabilité des clients. Même licence que les autres plugins Coinvera.', path: '/paiement-livraison', keywords: ['paiement à la livraison WooCommerce', 'confirmation commande WhatsApp', 'COD WooCommerce', 'colis refusés e-commerce', 'plugin anti faux acheteurs'] });
const F = [
  [MessageCircle, 'Confirmation par WhatsApp', 'Chaque commande payable à la livraison reste en attente jusqu’à ce que le client confirme, en un clic, depuis le message reçu sur WhatsApp.'],
  [PackageCheck, 'Vous n’expédiez que le confirmé', 'Confirmée, la commande passe en traitement. Refusée ou sans réponse dans le délai que vous fixez, elle est annulée, ou laissée en attente si vous préférez décider.'],
  [Gauge, 'Score de fiabilité', 'Chaque client reçoit un score de 0 à 100 d’après l’historique de votre boutique : livraisons réussies, colis refusés, commandes non confirmées.'],
  [ShieldCheck, 'COD retiré aux clients à risque', 'Sous le seuil que vous choisissez, le paiement à la livraison n’est plus proposé : le client doit payer en ligne. Un nouveau client n’est jamais pénalisé d’avance.'],
  [PhoneCall, 'Actions manuelles', 'Depuis l’écran de commande : renvoyer la demande, confirmer par téléphone, ou marquer un colis refusé pour mettre le score à jour.'],
  [ListChecks, 'Journal des confirmations', 'Confirmations, refus, délais dépassés et COD refusés par le score sont journalisés et conservés 180 jours.'],
] as const;
const STEPS = [['Activez le paiement à la livraison dans WooCommerce', 'Coinvera COD s’appuie sur le mode de paiement à la livraison de WooCommerce.'], ['Installez le fichier ZIP dans WordPress', 'Extensions → Ajouter → Téléverser, puis activez.'], ['Saisissez votre licence et votre clé API', 'Coinvera COD → Réglages. Les mêmes identifiants que vos autres plugins Coinvera.'], ['Réglez le délai et le seuil de score', 'Délai de confirmation, action en cas de silence, score minimum : tout se règle sans toucher au code.']] as const;
const FAQ = [
  ['Une vérification d’identité est-elle demandée ?', 'Non. Aucune vérification d’identité (KYC) n’est demandée pour créer un compte Coinvera, utiliser ce plugin, encaisser des paiements ou retirer vos fonds. Seule exception : les cartes virtuelles, dont l’émetteur partenaire exige l’identité du titulaire.'],
  ['Comment le client confirme-t-il ?', 'Il reçoit un message WhatsApp avec un lien. La page qui s’ouvre propose deux boutons, « Oui, je confirme » et « Non, ce n’est pas moi ». Seul un clic sur un bouton modifie la commande : l’aperçu automatique du lien par WhatsApp ne confirme rien.'],
  ['Et si le client n’a pas WhatsApp ?', 'La demande ne peut pas lui parvenir : confirmez alors par téléphone et utilisez l’action « marquer confirmée » sur la commande. Seul WhatsApp est pris en charge pour l’instant, pas le SMS.'],
  ['Comment le score est-il calculé ?', 'À partir de l’historique de votre seule boutique. Un nouveau client vaut environ 67 sur 100. Un colis refusé sans historique positif le fait passer sous le seuil par défaut de 40 ; trois livraisons réussies le rétablissent. Vous réglez le seuil.'],
  ['Que se passe-t-il quand un client est sous le seuil ?', 'Le paiement à la livraison disparaît de son checkout dès que son numéro est saisi, et il peut toujours payer en ligne. Sur le checkout en blocs, la commande est refusée avec un message à la validation.'],
  ['Les données de mes clients sont-elles stockées ?', 'Le plugin garde seulement des identifiants hachés et irréversibles du numéro et de l’e-mail, avec des compteurs, sans aucune donnée lisible. Le journal est conservé 180 jours, les scores 24 mois après la dernière activité.'],
  ['Faut-il une licence supplémentaire ?', 'Non, c’est la même licence que les autres plugins Coinvera.'],
] as const;
const CODE = `Commande payable à la livraison passée
  → client connu et sous le seuil ? COD refusé, il paie en ligne
  → sinon : commande en attente + WhatsApp « Confirmez votre commande n°1042 »

Le client clique sur le lien
  → « Je confirme »  : commande en traitement, prête à expédier
  → « Ce n’est pas moi » ou aucune réponse : commande annulée

Livrée et encaissée → score du client en hausse
Colis refusé       → score du client en baisse`;
export default async function P() { const s = await getSettings();
  return <PluginPage eyebrow="Plugin paiement à la livraison" title="Ne préparez que les commandes que vos clients confirment" sub="Confirmez chaque commande payable à la livraison par WhatsApp avant l’expédition et retirez le paiement à la livraison aux clients qui refusent leurs colis." 
    price={s.apiActivationUsd} features={F} steps={STEPS} priceNote="Un seul paiement unique : API de production et tous les plugins Coinvera, avec la même licence."
    bullets={['Même licence unique que les autres plugins', 'Aucun compte WhatsApp Business à créer', 'Délai et seuil de score réglables', 'Mises à jour du plugin']}
    previewTitle="Exemple de confirmation" preview={<Frame><div style={{ display: 'flex', justifyContent: 'space-between' }}><b>WhatsApp</b><span className="mut">À l’instant</span></div>
      <p style={{ margin: '12px 0', padding: 12, borderRadius: 10, background: '#DCF8C6' }}>Boutique Exemple a bien reçu votre commande n°1042. Pour que nous la préparions, confirmez-la ici : exemple.com/?cvc_order=1042…</p>
      <p className="mut" style={{ margin: 0 }}>Exemple fictif.</p></Frame>}
    codeTitle="Comment ça fonctionne" codeNote="Le parcours d’une commande payable à la livraison." code={CODE} faq={FAQ} />; }
