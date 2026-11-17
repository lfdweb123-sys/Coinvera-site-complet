import AuthForm from '@/components/AuthForm';
export const metadata = { title: 'Mot de passe oublié', robots: { index: false, follow: true }, alternates: { canonical: '/forgot-password' } };
export default function P() { return <AuthForm mode="forgot" />; }
