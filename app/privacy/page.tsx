import { seo } from '@/lib/seo';
import Legal from '@/components/Legal';
import { PRIVACY } from '@/lib/legal';
export const metadata = seo({ title: 'Politique de confidentialité', description: 'Politique de confidentialité de Coinvera LLC : données collectées, usage, conservation et vos droits.', path: '/privacy', keywords: ['politique de confidentialité Coinvera'] });
export default function P() { return <Legal d={PRIVACY} v={2} />; }
