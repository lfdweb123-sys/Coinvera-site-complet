import { Ban, BellRing, Gauge, ListChecks, MailWarning, ShieldCheck } from 'lucide-react';
import PluginPage, { Frame } from '@/components/PluginPage';
import { getSettings } from '@/lib/settings';
export const revalidate = 300;
export const metadata = { title: 'Plugin anti-fraude WordPress', description: 'Protégez votre checkout WooCommerce contre le card testing, les e-mails jetables et les tentatives répétées, sans CAPTCHA. Même licence que les autres plugins Coinvera.', alternates: { canonical: '/anti-fraude' } };
const F = [
  [Gauge, 'Vélocité par IP', 'Trop de commandes ou de paiements échoués depuis la même IP en peu de temps : blocage temporaire, durée réglable.'],
  [MailWarning, 'E-mails jetables', 'Détecte les domaines de messagerie temporaire les plus répandus : blocage ou simple signalement, au choix.'],
  [Ban, 'Listes manuelles', 'Listes blanches et noires par IP ou par e-mail (adresse exacte ou domaine entier), modifiables en un clic depuis le journal.'],
  [ShieldCheck, 'Sans CAPTCHA', 'Aucune friction pour les vrais clients : la détection est entièrement invisible, aucune case à cocher ni énigme à résoudre.'],
  [ListChecks, 'Journal des tentatives', 'Chaque blocage ou signalement est journalisé (motif, IP, e-mail, commande) et conservé 90 jours.'],
  [BellRing, 'Alerte groupée', 'Une notification par e-mail dès qu’une attaque démarre, au plus une toutes les 30 minutes.'],
] as const;
const STEPS = [['Installez WooCommerce si ce n’est pas déjà fait', 'Coinvera Guard protège le checkout WooCommerce, quelle que soit la passerelle de paiement utilisée.'], ['Installez le fichier ZIP dans WordPress', 'Extensions → Ajouter → Téléverser, puis activez.'], ['Saisissez votre licence', 'Coinvera Guard → Réglages. Les seuils par défaut conviennent à la plupart des boutiques.'], ['Ajustez si besoin', 'Seuils de vélocité, listes blanches/noires, e-mails jetables : tout est réglable sans toucher au code.']] as const;
const FAQ = [
  ['Faut-il utiliser la passerelle de paiement Coinvera ?', 'Non. Coinvera Guard protège le checkout WooCommerce quelle que soit la passerelle active : il agit avant même que la demande de paiement ne parte.'],
  ['Les vrais clients voient-ils une différence ?', 'Non. Il n’y a ni CAPTCHA ni étape supplémentaire ; seules les tentatives suspectes sont ralenties ou bloquées.'],
  ['Que se passe-t-il quand une IP est bloquée ?', 'Le client voit un message générique l’invitant à réessayer plus tard. Le motif réel n’est visible que dans votre tableau de bord.'],
  ['Puis-je débloquer quelqu’un bloqué par erreur ?', 'Oui, en un clic depuis le journal des tentatives (« Autoriser cette IP » ou « Autoriser cet e-mail »).'],
  ['Faut-il une licence supplémentaire ?', 'Non. C’est la même licence que les autres plugins Coinvera, incluse dans l’activation de votre compte.'],
  ['Et les données personnelles ?', 'Seules les tentatives bloquées ou signalées sont journalisées (IP, e-mail, motif), conservées 90 jours, et le plugin s’intègre aux outils RGPD de WordPress.'],
] as const;
const CODE = `Checkout → Coinvera Guard vérifie, avant le paiement :
  • cette IP n'a-t-elle pas dépassé la limite de commandes/échecs ?
  • cet e-mail n'est-il pas une adresse jetable ?
  • cette IP ou cet e-mail n'est-il pas sur liste noire ?
→ Suspect : commande refusée, tentative journalisée
→ Normal : le checkout continue sans aucune friction`;
export default async function P() { const s = await getSettings();
  return <PluginPage eyebrow="Plugin anti-fraude" title="Bloquez le card testing avant qu’il n’atteigne votre passerelle de paiement" sub="Une protection invisible du checkout WooCommerce contre les bots de card testing, les adresses jetables et les tentatives répétées, sans CAPTCHA ni friction pour vos clients."
    price={s.apiActivationUsd} features={F} steps={STEPS} priceNote="Un seul paiement unique : API de production et tous les plugins Coinvera, avec la même licence."
    bullets={['Même licence unique que les autres plugins', 'Fonctionne avec toute passerelle WooCommerce', 'Seuils entièrement réglables', 'Mises à jour du plugin']}
    previewTitle="Aperçu du journal" preview={<Frame><div style={{ display: 'flex', justifyContent: 'space-between' }}><b>3 tentatives bloquées</b><span className="mut">Dernières 24 h</span></div>
      <table style={{ width: '100%', margin: '12px 0', borderCollapse: 'collapse' }}><tbody>{[['203.0.113.4', 'Vélocité (8 commandes/5 min)'], ['198.51.100.9', 'E-mail jetable'], ['192.0.2.17', 'Paiements échoués répétés']].map(([a, b]) => <tr key={a}><td style={{ padding: '6px 0', borderBottom: '1px solid #E5EAF2' }}>{a}</td><td style={{ textAlign: 'right', borderBottom: '1px solid #E5EAF2' }}>{b}</td></tr>)}</tbody></table>
      <p className="mut" style={{ margin: 0 }}>Exemple fictif.</p></Frame>}
    codeTitle="Comment ça protège" code={CODE} faq={FAQ} />; }
