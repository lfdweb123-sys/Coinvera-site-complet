import { Check } from 'lucide-react';
import { Header, Footer } from '@/components/Site';
import PageHero from '@/components/PageHero';
import CtaLink from '@/components/Cta';
import { CardLogos } from '@/components/Logos';
import { getSettings } from '@/lib/settings';
export const revalidate = 300;
export const metadata = { title: 'Plugin WooCommerce', description: 'Acceptez les cartes dans votre boutique WooCommerce. Configuration automatique, confirmation des commandes vérifiée côté serveur.', alternates: { canonical: '/woocommerce' } };
export default async function P() { const s = await getSettings();
  return <><Header /><PageHero v={0} eyebrow="WooCommerce" title="Le paiement par carte dans votre boutique" sub="Vos commandes passent en « payée » uniquement après confirmation côté serveur, jamais sur un simple retour du client." />
    <main className="sec"><div className="wrap split"><div className="g2" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>{[['Créez votre compte et activez-le', 'Un seul paiement unique : la licence du plugin est incluse.'], ['Installez le fichier ZIP dans WordPress', 'Extensions → Ajouter → Téléverser.'], ['Saisissez votre licence et vos clés API', 'Le webhook se configure tout seul à l’enregistrement.'], ['Les commandes se mettent à jour automatiquement', 'Confirmation par webhook, avec vérification de secours.']].map(([t, d], i) => <div className="step" key={t}><i>{i + 1}</i><h3 style={{ fontSize: 17 }}>{t}</h3><p className="mut" style={{ margin: 0 }}>{d}</p></div>)}</div>
      <div className="card price hi"><span className="mut">Inclus dans l’activation</span><div className="big">{s.apiActivationUsd} $</div><p className="mut">Un seul paiement unique : API de production et plugin.</p><ul className="ck">{['Activation par site', 'Mises à jour du plugin', 'Webhook configuré automatiquement', 'Commandes en USD'].map(x => <li key={x}><Check size={18} />{x}</li>)}</ul>
        <div style={{ margin: '20px 0' }}><CardLogos label="Cartes acceptées :" /></div><CtaLink className="btn p lg full" guest={['/register', 'Commencer']} user={['/dashboard/woocommerce', 'Activer la licence']} /></div></div></main><Footer /></>; }
