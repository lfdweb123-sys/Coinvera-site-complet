import Legal from '@/components/Legal';
import { PRIVACY } from '@/lib/legal';
export const metadata = { title: 'Politique de confidentialité' };
export default function P() { return <Legal d={PRIVACY} />; }
