import { catalog, isProviderError } from '@/lib/numbers/catalog';
import { getSettings } from '@/lib/settings';
// Public (sans compte) : pays, disponibilité en direct et prix. Mis en cache 5 minutes côté CDN, comme les données de 5sim.
export async function GET() {
  try {
    if (!(await getSettings() as any).numbersEnabled) return Response.json({ error: 'numbers_disabled' }, { status: 503 });
    return Response.json(await catalog(), { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } });
  } catch (e) { return Response.json({ error: isProviderError(e) ? 'numbers_unavailable' : 'internal_error' }, { status: 503 }); }
}
