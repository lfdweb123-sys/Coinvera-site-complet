import Legal from '@/components/Legal';
import { TERMS } from '@/lib/legal';
export const metadata = { title: 'Conditions d’utilisation', description: 'COINVERA — Conditions d’utilisation.', alternates: { canonical: '/terms' } };
export default function P() { return <Legal d={TERMS} v={1} />; }
