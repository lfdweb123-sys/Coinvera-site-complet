import { seo } from '@/lib/seo';
import { Header, Footer } from '@/components/Site';
import { SITE } from '@/lib/site';
import PageHero from '@/components/PageHero';
import HelpCenter from '@/components/HelpCenter';
import Link from 'next/link';
export const metadata = seo({ title: 'Centre d’aide', description: 'Guides et réponses : création de compte, activation, paiements par carte, retraits USDT, API et plugin WooCommerce.', path: '/helpcenter', keywords: ['aide Coinvera', 'guide paiement par carte', 'comment retirer en USDT', 'activer son compte', 'support API de paiement'] });
export default function P() { return <><Header base={SITE} /><PageHero v={0} eyebrow="Centre d’aide" title="Comment pouvons-nous vous aider ?" sub="Retrouvez les réponses aux questions les plus fréquentes sur Coinvera." />
  <main className="sec" style={{ paddingTop: 0 }}><div className="wrap"><HelpCenter /><div className="card" style={{ marginTop: 40, textAlign: 'center' }}><h3 style={{ fontSize: 22 }}>Vous ne trouvez pas votre réponse ?</h3><p className="mut" style={{ margin: '8px 0 16px' }}>Notre équipe vous répond par e-mail dans les meilleurs délais.</p><Link className="btn p lg" href="https://www.coinvera.me/contact">Contacter le support</Link></div></div></main><Footer base={SITE} /></>; }
