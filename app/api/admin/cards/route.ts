import { z } from 'zod';
import { AggregateField } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { fail, requireAdmin } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { warn } from '@/lib/log';
import { ci } from '@/lib/cards/cryptoinfra';
import { cardSettings } from '@/lib/cards/settings';
const Body = z.object({ enabled: z.boolean(), refundAdvance: z.boolean(), issueFlat: z.number().min(0).max(1000), issueBps: z.number().int().min(0).max(5000), loadFlat: z.number().min(0).max(1000), loadBps: z.number().int().min(0).max(5000) }).partial();
// Réglages du module cartes + état du portefeuille du programme (celui qui paie réellement chaque carte chez CryptoInfra).
const safe = async <T,>(name: string, f: () => Promise<T>, d: T): Promise<T> => { try { return await f(); } catch (e) { warn('admin.cards_metric_failed', { name, message: (e as Error).message }); return d; } };
export async function GET(req: Request) {
  try {
    await requireAdmin(req); const settings = await cardSettings();      // les réglages sont renvoyés quoi qu'il arrive : un indicateur en échec ne vide jamais le formulaire
    let wallet: any = null, maintenance: boolean | null = null, error: string | null = null;
    try { const w = (await ci('GET', '/v1/cards/wallet', { timeoutMs: 6000 })).data; wallet = (w.wallets ?? []).map((x: any) => ({ core: x.core_id, name: x.name, status: x.status, balance: x.balance, spent24h: x.spent_24h, low: !!x.low, addresses: x.addresses ?? [], rechargeFeeBps: x.recharge_fee_bps ?? null })); maintenance = !!(await ci('GET', '/v1/cards/maintenance', { timeoutMs: 6000 })).data.active; }
    catch (e) { error = (e as Error).message; }
    const now = Date.now();
    const [pend, holders, sums, adv, pendDocs] = await Promise.all([
      safe('pending', async () => (await db.collection('card_orders').where('status', 'in', ['reserved', 'processing']).count().get()).data().count, null as number | null),
      safe('holders', async () => (await db.collection('card_holders').count().get()).data().count, null as number | null),
      safe('liabilities', async () => (await db.collection('balances').aggregate({ credit: AggregateField.sum('card_credit'), reserved: AggregateField.sum('card_reserved') }).get()).data(), null as any),
      safe('advances', async () => (await db.collection('card_items').where('advanced', '==', true).get()).docs.map(d => d.data()), null as any[] | null),
      safe('oldest', async () => (await db.collection('card_orders').where('status', 'in', ['reserved', 'processing']).get()).docs.map(d => d.data().createdAtMs ?? now), null as number[] | null)]);
    const open = (adv ?? []).filter(c => !c.settled);
    const advances = adv ? { count: open.length, units: open.reduce((a, c) => a + (c.advanceUnits ?? 0), 0) / 1e6, oldestDays: open.length ? Math.floor((now - Math.min(...open.map(c => c.advancedAt ?? now))) / 86_400_000) : 0, held: open.filter(c => c.refundState === 'held').length, stale: open.filter(c => now - (c.advancedAt ?? now) > 50 * 86_400_000).length } : null;
    return Response.json({ settings, wallet, maintenance, error, pendingOrders: pend, oldestPendingMin: pendDocs?.length ? Math.floor((now - Math.min(...pendDocs)) / 60_000) : 0, holders, liabilities: sums ? { credit: (sums.credit ?? 0) / 1e6, reserved: (sums.reserved ?? 0) / 1e6 } : null, advances });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
export async function PUT(req: Request) {
  try { const a = await requireAdmin(req); const b = Body.parse(await req.json()); const before = await cardSettings();
    await db.doc('card_settings/config').set(b, { merge: true }); await audit(a.uid, 'cards.settings', { before, after: b }); return Response.json({ ok: true });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
