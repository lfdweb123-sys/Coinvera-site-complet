import Link from 'next/link';
import { Check } from 'lucide-react';
import { Header, Footer } from '@/components/Site';
import PageHero from '@/components/PageHero';
import { getSettings } from '@/lib/settings';
export const revalidate = 300; export const metadata = { title: 'Plugin WooCommerce' };
export default async function P() { const s = await getSettings();
  return <><Header /><PageHero eyebrow="WooCommerce" title="Le paiement par carte dans votre boutique" sub="Vos commandes passent en « payée » uniquement après confirmation côté serveur, jamais sur un simple retour du client." />
    <main className="wrap sec" style={{ paddingTop: 40 }}><div className="split"><div className="stack"><div className="steps" style={{ gridTemplateColumns: '1fr' }}>{['Créez votre compte et achetez la licence', 'Installez le fichier ZIP dans WordPress', 'Saisissez votre licence et vos clés API', 'Les statuts des commandes se mettent à jour automatiquement'].map(t => <div className="step" key={t}><h3 style={{ fontSize: 17 }}>{t}</h3></div>)}</div></div>
      <div className="card price hi"><span className="mut">Licence</span><div className="big">{s.pluginPriceUsd} $</div><ul className="ck">{['Activation par site', 'Mises à jour du plugin', 'Vérification automatique toutes les 5 minutes', 'Commandes en USD'].map(x => <li key={x}><Check size={18} />{x}</li>)}</ul><div style={{ marginTop: 22 }}><Link className="btn p lg" href="/register">Commencer</Link></div></div></div></main><Footer /></>; }
