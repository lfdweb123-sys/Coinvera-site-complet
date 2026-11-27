import { z } from 'zod';
import { db } from '@/lib/firebase-admin';
import { fail, requireAdmin } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { fiatSettings, sanitize } from '@/lib/fiat/settings';
import { FIAT_LIMITS } from '@/lib/fiat/quote';
import { feexConfigured } from '@/lib/fiat/feexpay';
import { liveRate } from '@/lib/fiat/rates';
import { reconcileFiat, resolveFiat } from '@/lib/fiat/orders';
import { fromUnits } from '@/lib/money';
import { warn } from '@/lib/log';
// Réglages des paiements FeexPay pour les cartes, taux du jour, gains estimés et commandes à trancher.
const num = (k: keyof typeof FIAT_LIMITS) => z.number().min(FIAT_LIMITS[k][0]).max(FIAT_LIMITS[k][1]);
const Body = z.object({ enabled: z.boolean(), marginBps: num('marginBps').int(), minGainUsd: num('minGainUsd'), feeBps: num('feeBps').int(), bufferXofBps: num('bufferXofBps').int(), bufferNgnBps: num('bufferNgnBps').int(), floorXof: num('floorXof'), floorNgn: num('floorNgn'), depositMin: num('depositMin'), depositMax: num('depositMax') }).partial();
export async function GET(req: Request) {
  try {
    await requireAdmin(req); const settings = await fiatSettings(); const rates: Record<string, number | null> = {};
    for (const c of ['XOF', 'NGN'] as const) rates[c] = await liveRate(c).catch(() => null);
    // Chaque lecture est isolée : un index Firestore manquant ou une panne ne doit jamais empêcher d'afficher et d'enregistrer les réglages.
    const safe = async (q: Promise<FirebaseFirestore.QuerySnapshot>) => { try { return await q; } catch (e) { warn('admin.fiat.query_failed', { message: (e as Error).message }); return null; } };
    const fulfilled = db.collection('fiat_orders').where('status', '==', 'fulfilled');
    const [done0, review, open] = await Promise.all([safe(fulfilled.orderBy('paidAt', 'desc').limit(200).get()), safe(db.collection('fiat_orders').where('status', '==', 'review').get()), safe(db.collection('fiat_orders').where('status', 'in', ['awaiting', 'otp']).get())]);
    const done = done0 ?? await safe(fulfilled.limit(200).get()); const docsOf = (x: FirebaseFirestore.QuerySnapshot | null) => x?.docs ?? [];
    let credited = 0, gain = 0; docsOf(done).forEach(d => { credited += d.data().creditedUnits ?? 0; gain += d.data().gainUsd ?? 0; });
    return Response.json({ settings, configured: feexConfigured(), enabled: settings.enabled, rates, limits: FIAT_LIMITS, stats: { fulfilled: docsOf(done).length, creditedUsd: fromUnits(credited), gainUsd: gain.toFixed(2), open: docsOf(open).length },
      recent: [...docsOf(done)].sort((a, b) => (b.data().paidAt ?? 0) - (a.data().paidAt ?? 0)).slice(0, 20).map(d => ({ id: d.id, scope: d.data().scope, method: d.data().methodId, local: d.data().local, label: d.data().label, creditUsd: fromUnits(d.data().creditedUnits ?? 0), gainUsd: d.data().gainUsd ?? 0, at: d.data().paidAt ?? 0 })),
      review: docsOf(review).map(d => ({ id: d.id, scope: d.data().scope, method: d.data().methodId, local: d.data().local, label: d.data().label, creditUsd: fromUnits(d.data().creditUnits ?? 0), reason: d.data().reviewReason ?? null, reference: d.data().reference ?? null, merchantId: d.data().merchantId })) });
  } catch (e) { return fail(e); }
}
export async function PUT(req: Request) {
  try {
    const a = await requireAdmin(req); const b = Body.parse(await req.json()); const cur = await fiatSettings(); const next = sanitize({ ...cur, ...b });
    await db.doc('fiat_settings/config').set(next); await audit(a.uid, 'fiat.settings', b as object).catch(() => {});
    return Response.json({ settings: next });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
export async function POST(req: Request) {
  try {
    const a = await requireAdmin(req); const raw = await req.json();
    if (raw?.action === 'reconcile') { const r = await reconcileFiat(true); await audit(a.uid, 'fiat.reconcile', r as object).catch(() => {}); return Response.json({ ok: true, ...r }); }
    const b = z.object({ action: z.literal('resolve'), id: z.string().max(40), decision: z.enum(['credit', 'reject']) }).parse(raw);
    await resolveFiat(b.id, b.decision); await audit(a.uid, 'fiat.resolve', { id: b.id, decision: b.decision }).catch(() => {});
    return Response.json({ ok: true });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
