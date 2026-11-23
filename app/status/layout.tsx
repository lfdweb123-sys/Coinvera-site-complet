import { seo } from '@/lib/seo';
export const metadata = seo({ title: 'État des services', path: '/status', description: 'État en temps réel des services Coinvera : paiements par carte, API, base de données et envoi des retraits.', keywords: ['statut Coinvera', 'état des services de paiement', 'disponibilité API'] });
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
