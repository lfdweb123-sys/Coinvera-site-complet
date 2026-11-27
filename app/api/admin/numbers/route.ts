import { db } from '@/lib/firebase-admin';
import { fail, requireAdmin } from '@/lib/auth';
import { profile } from '@/lib/numbers/fivesim';
// Tableau de bord exploitant : solde et note du compte 5sim (note à 0 = achats bloqués 24 h), commandes par statut, dernières commandes.
export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const [p, all] = await Promise.all([profile().catch(() => null), db.collection('fivesim_orders').limit(2000).get()]);
    const counts: Record<string, number> = {}; const rows = all.docs.map(d => ({ id: d.id, ...d.data() } as any));
    for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
    const ms = (v: any) => v?.toMillis ? v.toMillis() : typeof v === 'number' ? v : 0;
    const recent = rows.sort((a, b) => ms(b.createdAt) - ms(a.createdAt)).slice(0, 50).map(r => ({ id: r.id, merchantId: r.merchantId, service: r.service, country: r.countryName ?? r.country, status: r.status, error: r.error ?? null, chargeUsd: (r.chargeUnits ?? 0) / 1e6, priceXof: r.priceXof, providerPrice: r.providerPrice ?? null, requestedAt: r.requestedAt ?? 0 }));
    return Response.json({ provider: p, counts, recent });
  } catch (e) { return fail(e); }
}
