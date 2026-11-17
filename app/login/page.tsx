import AuthForm from '@/components/AuthForm';
export const metadata = { title: 'Connexion', robots: { index: false, follow: true }, alternates: { canonical: '/login' } };
export default function P() { return <AuthForm mode="login" />; }
