import { db } from '@/lib/firebase-admin';
import { fail, requireAdmin } from '@/lib/auth';
import { px, proxnumEnabled, isOk } from '@/lib/proxnum/api';
import { countryName, markup, serviceName } from '@/lib/proxnum/pricing';
import { fromUnits } from '@/lib/money';
// Tableau de bord exploitant ProxNum : solde du compte revendeur (un solde vide bloque tous les achats, les utilisateurs sont alors remboursés), commandes par statut, marge réalisée, dernières commandes.
export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const bal = proxnumEnabled() ? await px('GET', '/resell/balance').then(r => (isOk(r) && Number.isFinite(Number(r.j.balance)) ? Number(r.j.balance) : null)).catch(() => null) : null;
    const rows = (await db.collection('proxnum_orders').limit(2000).get()).docs.map((d): Record<string, any> => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
    const counts: Record<string, number> = {}; let revenue = 0, margin = 0;
    for (const r of rows) { counts[r.status] = (counts[r.status] ?? 0) + 1; if (r.status === 'confirmed') { revenue += r.chargeUnits ?? 0; margin += (r.chargeUnits ?? 0) - (r.costUnits ?? 0); } }
    const m = markup();
    return Response.json({ enabled: proxnumEnabled(), balance: bal, counts, revenue: fromUnits(revenue), margin: fromUnits(margin), markupBps: m.bps, markupFlat: fromUnits(m.flatUnits),
      recent: rows.slice(0, 60).map(r => ({ id: r.id, merchantId: String(r.merchantId ?? '').slice(0, 8), kind: r.kind, status: r.status, service: r.service ? serviceName(r.service) : null, country: r.country != null ? countryName(String(r.country), r.countryName) : null, phone: r.phone ? String(r.phone).replace(/.(?=.{4})/g, '•') : null, charge: fromUnits(r.chargeUnits ?? 0), cost: fromUnits(r.costUnits ?? 0), error: r.error ?? r.reviewReason ?? null, at: r.createdAtMs ?? 0 })) });
  } catch (e) { return fail(e); }
}
