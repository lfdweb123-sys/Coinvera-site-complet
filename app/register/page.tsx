import { seo } from '@/lib/seo';
import AuthForm from '@/components/AuthForm';
export const metadata = seo({ title: 'Créer un compte gratuit', description: 'Créez votre compte Coinvera gratuitement : testez l’API avec deux opérations offertes, puis activez la production pour encaisser par carte et retirer en USDT.', path: '/register', keywords: ['créer un compte Coinvera', 'ouvrir un compte marchand', 'inscription passerelle de paiement'] });
export default function P() { return <AuthForm mode="register" />; }
