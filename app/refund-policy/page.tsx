import { seo } from '@/lib/seo';
import Legal from '@/components/Legal';
import { REFUND } from '@/lib/legal';
export const metadata = seo({ title: 'Politique de remboursement', description: 'Politique de remboursement de Coinvera LLC : conditions applicables aux paiements, licences et services.', path: '/refund-policy', keywords: ['politique de remboursement Coinvera'] });
export default function P() { return <Legal d={REFUND} v={0} />; }
