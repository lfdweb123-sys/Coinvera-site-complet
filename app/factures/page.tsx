import { Bell, CreditCard, FileText, Printer, ShieldCheck, Hash } from 'lucide-react';
import PluginPage, { Frame } from '@/components/PluginPage';
import { getSettings } from '@/lib/settings';
export const revalidate = 300;
export const metadata = { title: 'Plugin de factures WordPress', description: 'Créez des factures numérotées sur WordPress avec lien de paiement par carte, statut « payée » automatique et relances automatiques. Même licence que les autres plugins Coinvera.', alternates: { canonical: '/factures' } };
const F = [
  [Hash, 'Numérotation fiable', 'Numéros PRÉFIXE-2026-0001 attribués de façon atomique : jamais de doublon, jamais réutilisés.'],
  [FileText, 'Lignes, remise et taxe', 'Quantités, prix unitaires, remise et taux de taxe. Tous les montants sont calculés côté serveur, en entiers.'],
  [CreditCard, 'Lien de paiement par carte', 'Chaque facture a une page privée avec un bouton « Payer par carte » : paiement hébergé par Coinvera.'],
  [ShieldCheck, 'Payée seulement si vérifiée', 'Une facture n’est marquée payée qu’après relecture du paiement auprès de l’API (montant, référence, mode réel).'],
  [Bell, 'Relances automatiques', 'Relances par paliers de retard (3, 7, 14 jours par défaut), reçu de paiement et notification.'],
  [Printer, 'Imprimable et exportable', 'Page de facture imprimable ou enregistrable en PDF, encaissement manuel, duplication et export CSV.'],
] as const;
const STEPS = [['Créez votre compte et activez-le', 'Un seul paiement unique : la licence du plugin est incluse.'], ['Installez le fichier ZIP dans WordPress', 'Extensions → Ajouter → Téléverser, puis activez.'], ['Saisissez licence, clés API et infos entreprise', 'Factures Coinvera → Réglages. Le webhook se configure automatiquement.'], ['Créez une facture et envoyez-la', 'Le client reçoit un lien ; la facture passe à « payée » dès le paiement confirmé.']] as const;
const FAQ = [
  ['Une vérification d’identité est-elle demandée ?', 'Non. Aucune vérification d’identité (KYC) n’est demandée pour créer un compte Coinvera, utiliser ce plugin, encaisser des paiements ou retirer vos fonds. Seule exception : les cartes virtuelles, dont l’émetteur partenaire exige l’identité du titulaire.'],
  ['Faut-il WooCommerce ?', 'Non. Le plugin fonctionne seul sur WordPress 5.8 et plus, PHP 7.4 et plus.'],
  ['Faut-il une licence supplémentaire ?', 'Non. C’est la même licence que les autres plugins Coinvera, incluse dans l’activation de votre compte. Elle s’active par site, et les plugins peuvent cohabiter.'],
  ['Que se passe-t-il si un client paie une facture annulée ?', 'Le paiement n’est pas validé automatiquement : la facture est signalée « paiement à vérifier » et vous recevez un e-mail pour traiter le cas (remboursement par exemple).'],
  ['Dans quelle devise ?', 'En dollars américains (USD). Le paiement en ligne accepte des totaux de 1 $ à 50 000 $ ; au-delà, vous pouvez marquer la facture payée manuellement.'],
  ['Mes factures sont-elles publiques ?', 'Non. Chaque facture n’est accessible que par un lien privé impossible à deviner, non référencé par les moteurs de recherche.'],
  ['Et les données personnelles ?', 'Le plugin s’intègre aux outils d’export de WordPress. Les factures étant des pièces comptables, l’outil d’effacement indique qu’elles sont conservées.'],
] as const;
const CODE = `Factures Coinvera → Nouvelle facture
  • client, e-mail, échéance
  • lignes : description, quantité, prix
  • remise et taxe (optionnelles)
→ Envoyer au client : lien privé + bouton « Payer »`;
export default async function P() { const s = await getSettings();
  return <PluginPage eyebrow="Plugin de factures" title="Facturez, encaissez par carte et relancez automatiquement" sub="Des factures numérotées avec lien de paiement, statut « payée » automatique et relances des retards, directement dans WordPress." price={s.apiActivationUsd}
    features={F} steps={STEPS} priceNote="Un seul paiement unique : API de production et tous les plugins Coinvera, avec la même licence."
    bullets={['Même licence unique que les autres plugins', 'Factures et clients illimités', 'Mises à jour du plugin', 'Paiement en USD, par carte Visa et Mastercard']}
    previewTitle="Aperçu d’une facture" preview={<Frame><div style={{ display: 'flex', justifyContent: 'space-between' }}><b>Facture FAC-2026-0042</b><span className="mut">Échéance 30/11/2026</span></div>
      <table style={{ width: '100%', margin: '12px 0', borderCollapse: 'collapse' }}><tbody>{[['Création de site', '1 × 800 $'], ['Maintenance (3 mois)', '3 × 50 $']].map(([a, b]) => <tr key={a}><td style={{ padding: '6px 0', borderBottom: '1px solid #E5EAF2' }}>{a}</td><td style={{ textAlign: 'right', borderBottom: '1px solid #E5EAF2' }}>{b}</td></tr>)}</tbody></table>
      <p style={{ margin: '0 0 12px', textAlign: 'right' }}><b>Total : 950 $</b></p><span className="btn p full" aria-hidden="true">Payer 950 $ par carte</span></Frame>}
    codeTitle="Un flux simple" code={CODE} faq={FAQ} />; }
