import Legal from '@/components/Legal';
import { PRIVACY } from '@/lib/legal';
export const metadata = { title: 'Politique de confidentialité', description: 'Coinvera LLC — Politique de confidentialité.', alternates: { canonical: '/privacy' } };
export default function P() { return <Legal d={PRIVACY} v={2} />; }
