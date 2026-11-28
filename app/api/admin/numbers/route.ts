import { db } from '@/lib/firebase-admin';
import { fail, requireAdmin } from '@/lib/auth';
import { banState } from '@/lib/numbers/limits';
import * as p5 from '@/lib/numbers/fivesim';
// Tableau de bord exploitant : tout ce que la documentation 5sim expose pour le compte revendeur (profil, notification, limites de prix, paiements, commandes) + nos commandes par statut.
export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const url = new URL(req.url); const page = Math.max(1, Number(url.searchParams.get('page')) || 1), size = 15;
    const soft = <T,>(f: Promise<T>) => f.catch(() => null);
    const [profile, notice, maxPrices, payments, history, all] = await Promise.all([soft(p5.profile()), soft(p5.flash('en')), soft(p5.maxPrices()), soft(p5.payments({ limit: size, offset: (page - 1) * size, order: 'id', reverse: true })),
      soft(p5.orders('activation', { limit: size, offset: (page - 1) * size, order: 'id', reverse: true })), db.collection('fivesim_orders').limit(2000).get()]);
    const counts: Record<string, number> = {}; const rows = all.docs.map(d => ({ id: d.id, ...d.data() } as any));
    for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
    const ms = (v: any) => v?.toMillis ? v.toMillis() : typeof v === 'number' ? v : 0;
    const recent = rows.sort((a, b) => ms(b.createdAt) - ms(a.createdAt)).slice(0, 50).map(r => ({ id: r.id, merchantId: r.merchantId, service: r.service, country: r.countryName ?? r.country, status: r.status, error: r.error ?? null, chargeUsd: (r.chargeUnits ?? 0) / 1e6, priceXof: r.priceXof, providerPrice: r.providerPrice ?? null, requestedAt: r.requestedAt ?? 0 }));
    return Response.json({ provider: profile, notice, maxPrices, payments, history, limits: banState(), page, size, counts, recent });
  } catch (e) { return fail(e); }
}
