import { seo } from '@/lib/seo';
import { Calculator, FileCheck, FileMinus, Hash, MapPin, ShieldCheck } from 'lucide-react';
import PluginPage, { Frame } from '@/components/PluginPage';
import { getSettings } from '@/lib/settings';
export const revalidate = 300;
export const metadata = seo({ title: 'Facturation électronique Factur-X pour WooCommerce', description: 'Factures électroniques conformes Factur-X (EN 16931) et TVA calculée en temps réel selon l’adresse et l’IP du client, pour WooCommerce. Même licence que les autres plugins.', path: '/facturation-electronique', keywords: ['facture électronique WooCommerce', 'Factur-X', 'facturation électronique obligatoire', 'EN 16931', 'TVA WooCommerce', 'plugin facture WordPress'] });
const F = [
  [FileCheck, 'De vraies factures structurées', 'Chaque commande produit un PDF lisible qui embarque le fichier XML Factur-X (profil EN 16931) : pas un simple PDF, mais une facture exploitable par les logiciels comptables et les plateformes de facturation.'],
  [Calculator, 'TVA en temps réel', 'La TVA suit l’adresse de facturation ou de livraison, et le pays de l’adresse IP tant que le client n’a rien saisi. Un outil crée en un clic les taux normaux manquants (UE et quelques pays africains).'],
  [MapPin, 'Cas transfrontaliers gérés', 'Autoliquidation pour un professionnel d’un autre État membre (n° de TVA vérifié auprès de VIES), livraison intracommunautaire, export, franchise en base : la bonne mention figure sur la facture.'],
  [FileMinus, 'Avoirs automatiques', 'Un remboursement WooCommerce génère l’avoir correspondant, rattaché à la facture d’origine. Une facture émise n’est jamais modifiée ni supprimée.'],
  [Hash, 'Numérotation sans trou', 'Numéros chronologiques par année (FA-2026-000001), séquence distincte pour les avoirs, attribution protégée contre les doubles clics et les commandes simultanées.'],
  [ShieldCheck, 'Léger et sans service tiers', 'Tout est généré sur votre serveur, sans bibliothèque lourde ni abonnement externe. La facture est jointe aux e-mails WooCommerce et téléchargeable depuis « Mon compte ».'],
] as const;
const STEPS = [['Installez WooCommerce et activez les taxes', 'Coinvera E-Invoice s’appuie sur les commandes et le moteur de taxes de WooCommerce.'], ['Installez le fichier ZIP dans WordPress', 'Extensions → Ajouter → Téléverser, puis activez.'], ['Renseignez votre licence et votre identité de vendeur', 'E-Invoice → Réglages : adresse, n° de TVA, régime. La même licence que vos autres plugins Coinvera.'], ['Créez les taux de TVA de vos pays de vente', 'Un bouton ajoute les taux normaux manquants, sans toucher à ceux que vous avez déjà configurés.']] as const;
const FAQ = [
  ['Une vérification d’identité est-elle demandée ?', 'Non. Aucune vérification d’identité (KYC) n’est demandée pour créer un compte Coinvera, utiliser ce plugin, encaisser des paiements ou retirer vos fonds. Seule exception : les cartes virtuelles, dont l’émetteur partenaire exige l’identité du titulaire.'],
  ['Le plugin transmet-il mes factures à l’administration fiscale ?', 'Non. Ce n’est pas une plateforme de dématérialisation agréée. Il produit des fichiers Factur-X conformes à la norme européenne EN 16931 ; en France, la transmission passe par une plateforme partenaire ou par le portail public de facturation, auxquels vous déposez ou raccordez ces fichiers.'],
  ['Comment la conformité du fichier est-elle contrôlée ?', 'Le XML produit est vérifié en test avec le schéma officiel UN/CEFACT et les règles métier EN 16931 publiées par la Commission européenne, sur les cas courants : vente nationale, multi-taux, autoliquidation, livraison intracommunautaire, export, franchise en base et avoir.'],
  ['Les taux de TVA sont-ils garantis à jour ?', 'Non : ce sont des taux normaux de départ, que vous pouvez modifier avant de les créer, et les taux réduits restent à configurer dans les classes de taxe WooCommerce. Faites valider la configuration par votre comptable, les taux évoluent.'],
  ['L’adresse IP sert-elle à décider de la TVA ?', 'Seulement tant que le client n’a saisi aucune adresse, pour afficher un prix cohérent. Dès que l’adresse de facturation ou de livraison est connue, c’est elle qui prime. L’option se désactive dans les réglages.'],
  ['Faut-il une licence supplémentaire ?', 'Non, c’est la même licence que les autres plugins Coinvera.'],
] as const;
const CODE = `Commande payée (ou terminée, au choix)
  → TVA recalculée par taux, arrondis contrôlés
  → numéro FA-2026-000001 attribué, sans trou
  → facture-x.xml (EN 16931) intégré au PDF/A-3
  → PDF joint à l’e-mail WooCommerce du client

Remboursement WooCommerce
  → avoir AV-2026-000001 rattaché à la facture d’origine`;
export default async function P() { const s = await getSettings();
  return <PluginPage eyebrow="Plugin facturation électronique" title="Des factures conformes, sans usine à gaz" sub="Générez automatiquement des factures Factur-X pour vos commandes WooCommerce, avec une TVA calculée en temps réel selon l’adresse et l’IP de vos clients."
    price={s.apiActivationUsd} features={F} steps={STEPS} priceNote="Un seul paiement unique : API de production et tous les plugins Coinvera, avec la même licence."
    bullets={['Même licence unique que les autres plugins', 'Factur-X (EN 16931) : PDF + XML structuré', 'TVA, autoliquidation, export et avoirs gérés', 'Mises à jour du plugin']}
    previewTitle="Exemple de facture" preview={<Frame><div style={{ display: 'flex', justifyContent: 'space-between' }}><b>FACTURE FA-2026-000001</b><span className="mut">23/11/2026</span></div>
      <p style={{ margin: '12px 0 4px' }}>Casque audio × 1 · 59,90 € HT · TVA 20 %</p><p style={{ margin: '0 0 4px' }}>Livre × 3 · 27,00 € HT · TVA 5,5 %</p>
      <p style={{ margin: '12px 0 0' }}><b>Total TTC : 100,37 €</b></p><p className="mut" style={{ margin: '6px 0 0' }}>Facture électronique Factur-X (EN 16931) : fichier XML joint au PDF. Exemple fictif.</p></Frame>}
    codeTitle="Comment ça fonctionne" code={CODE} faq={FAQ} />; }
