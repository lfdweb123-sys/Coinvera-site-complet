import { Header, Footer } from '@/components/Site';
import { SITE } from '@/lib/site';
import Docs from './Docs';
export const metadata = { title: 'Documentation API' };
export default function P() { return <><Header base={SITE} /><Docs /><Footer base={SITE} /></>; }
