import { seo } from '@/lib/seo';
export const metadata = seo({ title: 'Contact et support', path: '/contact', description: 'Contactez l’équipe Coinvera : support technique, questions sur les paiements par carte, les retraits USDT, l’API et les plugins WordPress.', keywords: ['contact Coinvera', 'support paiement en ligne', 'assistance API de paiement'] });
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
