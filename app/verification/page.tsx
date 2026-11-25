import type { Metadata } from 'next';
import Verify from './Verify';
import { safeNext } from '@/lib/human';
export const metadata: Metadata = { title: 'Vérification de sécurité', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams, n = Array.isArray(sp.next) ? sp.next[0] : sp.next;
  return <Verify next={safeNext(n)} siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''} />;
}
