import { CreditCard, QrCode, ScanLine, ShieldCheck, Ticket, Users } from 'lucide-react';
import PluginPage, { Frame } from '@/components/PluginPage';
import { getSettings } from '@/lib/settings';
export const revalidate = 300;
export const metadata = { title: 'Plugin de billetterie WordPress', description: 'Vendez des billets d’événement sur WordPress avec QR code, jauge garantie sans surbooking et contrôle d’entrée sur téléphone. Même licence que les autres plugins Coinvera.', alternates: { canonical: '/billetterie' } };
const F = [
  [Ticket, 'Types de billets et quotas', 'Plusieurs tarifs par événement, quotas par type, fenêtre de vente et nombre maximum de billets par commande.'],
  [Users, 'Jauge garantie, sans surbooking', 'La capacité est vérifiée sous verrou à chaque réservation : jamais dépassée, même avec des achats simultanés.'],
  [CreditCard, 'Paiement par carte', 'Places réservées pendant le paiement, libérées automatiquement si le paiement n’aboutit pas.'],
  [ShieldCheck, 'Commande vérifiée côté serveur', 'Une commande n’est validée qu’après relecture du paiement auprès de l’API. Paiement tardif sans place : signalé, jamais de billet en trop.'],
  [QrCode, 'Billets avec QR code', 'Page privée imprimable envoyée par e-mail, un QR code et un code à contrôle intégré par participant.'],
  [ScanLine, 'Contrôle d’entrée mobile', 'Scan caméra ou saisie du code, résultat vert/rouge très lisible : chaque billet n’est valable qu’une seule fois.'],
] as const;
const STEPS = [['Créez votre compte et activez-le', 'Un seul paiement unique : la licence du plugin est incluse.'], ['Installez le fichier ZIP dans WordPress', 'Extensions → Ajouter → Téléverser, puis activez.'], ['Saisissez licence et clés API, créez un événement', 'Billetterie Coinvera → Réglages puis Événements. Le webhook se configure automatiquement.'], ['Placez la vitrine et contrôlez les entrées', 'Vos équipes ouvrent la page de contrôle sur leur téléphone le jour J.']] as const;
const FAQ = [
  ['Peut-on vendre plus de billets que la capacité ?', 'Non. La jauge est garantie : chaque réservation recompte les places sous verrou. Si un paiement arrive après la libération des places et que l’événement est complet, la commande est signalée « à vérifier » pour un remboursement manuel.'],
  ['Faut-il WooCommerce ?', 'Non. Le plugin fonctionne seul sur WordPress 5.8 et plus, PHP 7.4 et plus.'],
  ['Faut-il une licence supplémentaire ?', 'Non. C’est la même licence que les autres plugins Coinvera, incluse dans l’activation de votre compte.'],
  ['Comment fonctionne le contrôle d’entrée ?', 'Les administrateurs et éditeurs (ou tout rôle autorisé) ouvrent la page de contrôle sur téléphone, scannent le QR code ou saisissent le code. Un second scan du même billet est refusé et indique quand il a été utilisé.'],
  ['Peut-on offrir des billets ?', 'Oui : l’administration permet d’émettre des billets offerts, qui respectent la jauge. Les billets payants démarrent à 1 $ dans cette version.'],
  ['Et les remboursements ?', 'Vous remboursez dans votre tableau de bord Coinvera, puis marquez la commande remboursée : les billets sont annulés et les places libérées.'],
] as const;
const CODE = `[coinvera_event id="12"]           vitrine et achat de billets
[coinvera_checkin event="12"]      contrôle d'entrée (équipe connectée)

Billetterie Coinvera → Contrôle    même outil dans l'administration`;
export default async function P() { const s = await getSettings();
  return <PluginPage v={0} eyebrow="Plugin de billetterie" title="Vendez vos billets avec QR code, sans surbooking" sub="Jauge garantie, billets par e-mail avec QR code et contrôle d’entrée sur téléphone, directement dans WordPress." price={s.apiActivationUsd}
    features={F} steps={STEPS} priceNote="Un seul paiement unique : API de production et tous les plugins Coinvera, avec la même licence."
    bullets={['Même licence unique que les autres plugins', 'Événements et billets illimités', 'Mises à jour du plugin', 'Paiement en USD, par carte Visa et Mastercard']}
    previewTitle="Aperçu d’un événement" preview={<Frame><b style={{ fontSize: 17 }}>Concert de printemps</b><p className="mut" style={{ margin: '4px 0 12px' }}>12 avril 2027, 20:00 — Salle des Arts</p>
      {[['Standard', '20 $'], ['VIP', '50 $']].map(([a, b], i) => <div key={a} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #E5EAF2' }}><b>{a}</b><span>{b} &nbsp; <span className="mut">− {i === 0 ? 2 : 0} +</span></span></div>)}
      <p style={{ textAlign: 'right', margin: '10px 0' }}><b>Total : 40 $</b></p><span className="btn p full" aria-hidden="true">Acheter par carte</span></Frame>}
    codeTitle="Shortcodes" code={CODE} faq={FAQ} />; }
