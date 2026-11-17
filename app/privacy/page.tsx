import Legal from '@/components/Legal';
import { PRIVACY } from '@/lib/legal';
export const metadata = { title: 'Politique de confidentialité', description: 'COINVERA — Politique de confidentialité.', alternates: { canonical: '/privacy' } };
export default function P() { return <Legal d={PRIVACY} v={2} />; }
