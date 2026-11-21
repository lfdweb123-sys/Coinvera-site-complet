import { z } from 'zod';
import { db } from '@/lib/firebase-admin';
import { fail, requireAdmin } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { ci } from '@/lib/cards/cryptoinfra';
import { cardSettings } from '@/lib/cards/settings';
const Body = z.object({ enabled: z.boolean(), issueFlat: z.number().min(0).max(1000), issueBps: z.number().int().min(0).max(5000), loadFlat: z.number().min(0).max(1000), loadBps: z.number().int().min(0).max(5000) }).partial();
// Réglages du module cartes + état du portefeuille du programme (celui qui paie réellement chaque carte chez CryptoInfra).
export async function GET(req: Request) {
  try {
    await requireAdmin(req); const settings = await cardSettings(); let wallet: any = null, maintenance: boolean | null = null, error: string | null = null;
    try { const w = (await ci('GET', '/v1/cards/wallet')).data; wallet = (w.wallets ?? []).map((x: any) => ({ core: x.core_id, name: x.name, status: x.status, balance: x.balance, spent24h: x.spent_24h, low: !!x.low, addresses: x.addresses ?? [], rechargeFeeBps: x.recharge_fee_bps ?? null })); maintenance = !!(await ci('GET', '/v1/cards/maintenance')).data.active; }
    catch (e) { error = (e as Error).message; }
    const [pend, held] = await Promise.all([db.collection('card_orders').where('status', 'in', ['reserved', 'processing']).count().get(), db.collection('card_holders').count().get()]);
    return Response.json({ settings, wallet, maintenance, error, pendingOrders: pend.data().count, holders: held.data().count });
  } catch (e) { return fail(e); }
}
export async function PUT(req: Request) {
  try { const a = await requireAdmin(req); const b = Body.parse(await req.json()); const before = await cardSettings();
    await db.doc('card_settings/config').set(b, { merge: true }); await audit(a.uid, 'cards.settings', { before, after: b }); return Response.json({ ok: true });
  } catch (e) { return fail(e); }
}
