import AuthForm from '@/components/AuthForm';
export const metadata = { title: 'Créer un compte', robots: { index: false, follow: true }, alternates: { canonical: '/register' } };
export default function P() { return <AuthForm mode="register" />; }
