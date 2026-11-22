import Legal from '@/components/Legal';
import { REFUND } from '@/lib/legal';
export const metadata = { title: 'Politique de remboursement', description: 'Coinvera LLC — Politique de remboursement.', alternates: { canonical: '/refund-policy' } };
export default function P() { return <Legal d={REFUND} v={0} />; }
