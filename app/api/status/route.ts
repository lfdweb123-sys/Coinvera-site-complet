import { db } from '@/lib/firebase-admin';
export const dynamic = 'force-dynamic';
const t = async (u: string) => { try { return (await fetch(u, { signal: AbortSignal.timeout(4000), cache: 'no-store' })).ok; } catch { return false; } };
// Etat reel des services (sans nommer les prestataires).
let cache: { t: number; body: unknown } | null = null;
export async function GET() {
  if (cache && Date.now() - cache.t < 30_000) return Response.json(cache.body, { headers: { 'Cache-Control': 'no-store' } });   // 30 s de cache : l'endpoint public ne déclenche pas d'appels sortants à chaque visite
  const [db_, card, wd, cron] = await Promise.all([db.doc('system/ping').get().then(() => true).catch(() => false), t((process.env.PROCESSOR_BASE_URL ?? '') + '/status'), t((process.env.BYBIT_BASE_URL ?? '') + '/v5/market/time'),
    db.doc('system/cron').get().then(s => Date.now() - (s.data()?.lastRun ?? 0) < 20 * 60_000).catch(() => false)]);
  const st = (ok: boolean) => ok ? 'operational' : 'degraded';
  const body = { updatedAt: Date.now(), components: [{ name: 'Tableau de bord et API', status: st(db_) }, { name: 'Paiements par carte', status: st(card) }, { name: 'Envoi des retraits', status: st(wd && cron) }] };
  cache = { t: Date.now(), body }; return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
