import Legal from '@/components/Legal';
import { TERMS } from '@/lib/legal';
export const metadata = { title: 'Conditions d’utilisation' };
export default function P() { return <Legal d={TERMS} />; }
