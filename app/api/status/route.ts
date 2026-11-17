import { db } from '@/lib/firebase-admin';
export const dynamic = 'force-dynamic';
const t = async (u: string) => { try { return (await fetch(u, { signal: AbortSignal.timeout(4000), cache: 'no-store' })).ok; } catch { return false; } };
// Etat reel des services (sans nommer les prestataires).
export async function GET() {
  const [db_, card, wd, cron] = await Promise.all([db.doc('system/ping').get().then(() => true).catch(() => false), t((process.env.PROCESSOR_BASE_URL ?? '') + '/status'), t((process.env.BYBIT_BASE_URL ?? '') + '/v5/market/time'),
    db.doc('system/cron').get().then(s => Date.now() - (s.data()?.lastRun ?? 0) < 20 * 60_000).catch(() => false)]);
  const st = (ok: boolean) => ok ? 'operational' : 'degraded';
  return Response.json({ updatedAt: Date.now(), components: [{ name: 'Tableau de bord et API', status: st(db_) }, { name: 'Paiements par carte', status: st(card) }, { name: 'Envoi des retraits', status: st(wd && cron) }] }, { headers: { 'Cache-Control': 'no-store' } });
}
