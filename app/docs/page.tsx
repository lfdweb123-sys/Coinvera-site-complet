import { seo } from '@/lib/seo';
import { Header, Footer } from '@/components/Site';
import { SITE } from '@/lib/site';
import Docs from './Docs';
export const metadata = seo({ title: 'Documentation API de paiement', description: 'Documentation de l’API REST Coinvera : authentification, requêtes signées, paiements par carte, webhooks, retraits USDT et exemples de code.', path: '/docs', keywords: ['documentation API paiement', 'API REST paiement par carte', 'webhooks signés', 'intégrer une passerelle de paiement', 'clés API test et production'] });
export default function P() { return <><Header base={SITE} /><Docs /><Footer base={SITE} /></>; }
