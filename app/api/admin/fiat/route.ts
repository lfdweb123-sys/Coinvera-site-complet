import { z } from 'zod';
import { db } from '@/lib/firebase-admin';
import { fail, requireAdmin } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { fiatSettings, sanitize } from '@/lib/fiat/settings';
import { FIAT_LIMITS } from '@/lib/fiat/quote';
import { feexConfigured } from '@/lib/fiat/feexpay';
import { liveRate } from '@/lib/fiat/rates';
import { resolveFiat } from '@/lib/fiat/orders';
import { fromUnits } from '@/lib/money';
// Réglages des paiements FeexPay pour les cartes, taux du jour, gains estimés et commandes à trancher.
const num = (k: keyof typeof FIAT_LIMITS) => z.number().min(FIAT_LIMITS[k][0]).max(FIAT_LIMITS[k][1]);
const Body = z.object({ enabled: z.boolean(), marginBps: num('marginBps').int(), minGainUsd: num('minGainUsd'), feeBps: num('feeBps').int(), bufferXofBps: num('bufferXofBps').int(), bufferNgnBps: num('bufferNgnBps').int(), floorXof: num('floorXof'), floorNgn: num('floorNgn'), depositMin: num('depositMin'), depositMax: num('depositMax') }).partial();
export async function GET(req: Request) {
  try {
    await requireAdmin(req); const settings = await fiatSettings(); const rates: Record<string, number | null> = {};
    for (const c of ['XOF', 'NGN'] as const) rates[c] = await liveRate(c).catch(() => null);
    const [done, review, open] = await Promise.all([db.collection('fiat_orders').where('status', '==', 'fulfilled').orderBy('paidAt', 'desc').limit(200).get(), db.collection('fiat_orders').where('status', '==', 'review').get(), db.collection('fiat_orders').where('status', 'in', ['awaiting', 'otp']).get()]);
    let credited = 0, gain = 0; done.forEach(d => { credited += d.data().creditedUnits ?? 0; gain += d.data().gainUsd ?? 0; });
    return Response.json({ settings, configured: feexConfigured(), rates, limits: FIAT_LIMITS, stats: { fulfilled: done.size, creditedUsd: fromUnits(credited), gainUsd: gain.toFixed(2), open: open.size },
      recent: done.docs.slice(0, 20).map(d => ({ id: d.id, scope: d.data().scope, method: d.data().methodId, local: d.data().local, label: d.data().label, creditUsd: fromUnits(d.data().creditedUnits ?? 0), gainUsd: d.data().gainUsd ?? 0, at: d.data().paidAt ?? 0 })),
      review: review.docs.map(d => ({ id: d.id, scope: d.data().scope, method: d.data().methodId, local: d.data().local, label: d.data().label, creditUsd: fromUnits(d.data().creditUnits ?? 0), reason: d.data().reviewReason ?? null, reference: d.data().reference ?? null, merchantId: d.data().merchantId })) });
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
    const a = await requireAdmin(req); const b = z.object({ action: z.literal('resolve'), id: z.string().max(40), decision: z.enum(['credit', 'reject']) }).parse(await req.json());
    await resolveFiat(b.id, b.decision); await audit(a.uid, 'fiat.resolve', { id: b.id, decision: b.decision }).catch(() => {});
    return Response.json({ ok: true });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
