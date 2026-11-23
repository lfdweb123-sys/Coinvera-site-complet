import { seo } from '@/lib/seo';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { Header, Footer } from '@/components/Site';
import PageHero from '@/components/PageHero';
import CtaLink from '@/components/Cta';
import { LISTED } from '@/lib/plugins';
import { getSettings } from '@/lib/settings';
export const revalidate = 300;
export const metadata = seo({ title: 'Plugins WordPress de paiement', description: 'Plugins WordPress Coinvera : WooCommerce, dons, factures, abonnements, billetterie, anti-fraude et relance WhatsApp. Une seule licence pour tous.', path: '/plugins', keywords: ['plugins WordPress paiement', 'plugin paiement par carte WordPress', 'extensions WooCommerce', 'plugins e-commerce WordPress'] });
export default async function P() { const s = await getSettings();
  return <><Header /><PageHero v={1} eyebrow="Plugins" title="Une seule licence pour tous les plugins Coinvera" sub="Acceptez les cartes dans votre boutique, collectez des dons, facturez, vendez des abonnements et des billets, sur WordPress." />
    <main className="sec"><div className="wrap stack">
      <div className="g3">{LISTED.map(p => <Link href={p.href} className="card feat" key={p.key} style={{ textDecoration: 'none', color: 'inherit' }}><h3>{p.name}</h3><p>{p.tagline}</p><span className="mut">En savoir plus →</span></Link>)}</div>
      <div className="card price hi" style={{ maxWidth: 560, margin: '0 auto' }}><span className="mut">Inclus dans l’activation</span><div className="big">{s.apiActivationUsd} $</div>
        <p className="mut">Un seul paiement unique : API de production et tous les plugins, avec la même licence et les mises à jour.</p>
        <ul className="ck">{['Une licence pour tous les plugins, par site', 'Plugins WooCommerce, dons, factures, abonnements, billetterie', 'Webhooks automatiques, sans remplacer les vôtres', 'Paiement par carte Visa et Mastercard'].map(x => <li key={x}><Check size={18} />{x}</li>)}</ul>
        <CtaLink className="btn p lg full" guest={['/register', 'Commencer']} user={['/dashboard/woocommerce', 'Télécharger les plugins']} /></div>
    </div></main><Footer /></>; }
