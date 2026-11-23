import { seo } from '@/lib/seo';
import Legal from '@/components/Legal';
import { TERMS } from '@/lib/legal';
export const metadata = seo({ title: 'Conditions d’utilisation', description: 'Conditions d’utilisation des services Coinvera LLC : paiements par carte, retraits, API et plugins.', path: '/terms', keywords: ['conditions d’utilisation Coinvera'] });
export default function P() { return <Legal d={TERMS} v={1} />; }
