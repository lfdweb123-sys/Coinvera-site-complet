import { CalendarClock, CreditCard, Lock, ShieldCheck, UserCheck, Users } from 'lucide-react';
import PluginPage, { Frame } from '@/components/PluginPage';
import { getSettings } from '@/lib/settings';
export const revalidate = 300;
export const metadata = { title: 'Plugin d’abonnements WordPress', description: 'Vendez des abonnements sur WordPress par lien de paiement : échéances envoyées par e-mail, contenus réservés aux abonnés, relances et expiration automatiques. Même licence que les autres plugins Coinvera.', alternates: { canonical: '/abonnements' } };
const F = [
  [CalendarClock, 'Plans et périodes', 'Semaine, mois, trimestre ou an, avec délai de grâce. Les fins de mois sont gérées (31 janvier + 1 mois = fin février).'],
  [CreditCard, 'Lien de paiement à chaque échéance', 'Le membre reçoit son lien par e-mail avant l’échéance, avec rappels la veille et le jour même.'],
  [ShieldCheck, 'Paiement vérifié côté serveur', 'Une échéance n’est validée qu’après relecture du paiement auprès de l’API. Payer en avance ne fait perdre aucun jour.'],
  [Lock, 'Contenus réservés', 'Shortcode, case dans l’éditeur des articles et pages, ou fonction PHP pour vos propres thèmes.'],
  [UserCheck, 'Comptes sans risque', 'Compte WordPress créé seulement après le premier paiement réel ; un utilisateur existant garde son rôle.'],
  [Users, 'Espace membre', 'Statut, paiement de l’échéance et annulation du renouvellement par le membre lui-même.'],
] as const;
const STEPS = [['Créez votre compte et activez-le', 'Un seul paiement unique : la licence du plugin est incluse.'], ['Installez le fichier ZIP dans WordPress', 'Extensions → Ajouter → Téléverser, puis activez.'], ['Saisissez licence et clés API, créez un plan', 'Abonnements Coinvera → Réglages puis Plans. Le webhook se configure automatiquement.'], ['Placez le formulaire et réservez vos contenus', 'Les accès suivent les paiements : actifs, délai de grâce, puis expirés.']] as const;
const FAQ = [
  ['Une vérification d’identité est-elle demandée ?', 'Non. Aucune vérification d’identité (KYC) n’est demandée pour créer un compte Coinvera, utiliser ce plugin, encaisser des paiements ou retirer vos fonds. Seule exception : les cartes virtuelles, dont l’émetteur partenaire exige l’identité du titulaire.'],
  ['Les cartes sont-elles prélevées automatiquement ?', 'Non. Les paiements Coinvera sont des paiements uniques : à chaque échéance, le membre reçoit un lien et paie par carte. Tant que la période est payée, l’accès reste ouvert ; sinon il expire après le délai de grâce.'],
  ['Faut-il WooCommerce ?', 'Non. Le plugin fonctionne seul sur WordPress 5.8 et plus, PHP 7.4 et plus.'],
  ['Faut-il une licence supplémentaire ?', 'Non. C’est la même licence que les autres plugins Coinvera, incluse dans l’activation de votre compte.'],
  ['Que devient un membre qui paie en retard ?', 'S’il paie après expiration, sa nouvelle période repart de la date du paiement. S’il paie avant la fin, la période s’ajoute à la fin de la précédente.'],
  ['Un abonné peut-il annuler ?', 'Oui, depuis l’espace membre : plus d’échéances ni de relances, et l’accès reste valable jusqu’à la fin de la période déjà payée.'],
  ['Et les données personnelles ?', 'Outils d’export et d’effacement de WordPress pris en charge : l’effacement anonymise les abonnés et conserve les montants à titre comptable.'],
] as const;
const CODE = `[coinvera_subscribe plan="12"]            inscription au plan
[coinvera_members plan="12,13"]           contenu réservé
  Texte visible des abonnés uniquement
[/coinvera_members]
[coinvera_account]                        espace membre

// dans un thème :
if ( cvs_user_has_access( get_current_user_id(), [12] ) ) { … }`;
export default async function P() { const s = await getSettings();
  return <PluginPage v={2} eyebrow="Plugin d’abonnements" title="Vendez des abonnements et réservez vos contenus aux membres" sub="Échéances envoyées par e-mail avec lien de paiement, accès aux contenus tant que la période est payée, relances et expiration automatiques." price={s.apiActivationUsd}
    features={F} steps={STEPS} priceNote="Un seul paiement unique : API de production et tous les plugins Coinvera, avec la même licence."
    bullets={['Même licence unique que les autres plugins', 'Plans et abonnés illimités', 'Mises à jour du plugin', 'Paiement en USD, par carte Visa et Mastercard']}
    previewTitle="Aperçu d’un plan" preview={<Frame><b style={{ fontSize: 17 }}>Club Pro</b><p style={{ margin: '6px 0' }}><b style={{ fontSize: 22 }}>15 $</b> <span className="mut">/ mois</span></p><p className="mut" style={{ margin: '0 0 12px' }}>Accès à tous les contenus réservés.</p>
      <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}><span style={{ padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 8 }}>Nom</span><span style={{ padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 8 }}>E-mail</span></div><span className="btn p full" aria-hidden="true">S’abonner et payer par carte</span></Frame>}
    codeTitle="Shortcodes et accès" code={CODE} faq={FAQ} />; }
