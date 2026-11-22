import { db } from '@/lib/firebase-admin';
import { fail, HttpError, requireAdmin } from '@/lib/auth';
import { rows } from '@/lib/serialize';
const OK: Record<string, boolean> = { transactions: true, withdrawals: true, balances: false, api_keys: true, api_activations: false, notifications: true, audit_logs: true, woocommerce_licenses: true, support_tickets: true, merchants: true, crypto_orders: true, webhook_events: true, connections: true };
export async function GET(req: Request) {
  try { await requireAdmin(req); const c = new URL(req.url).searchParams.get('c') ?? '';
    if (!(c in OK)) throw new HttpError(400, 'unknown_collection');
    const q = OK[c] ? db.collection(c).orderBy('createdAt', 'desc') : db.collection(c);
    let items: any[] = rows(await q.limit(1000).get());
    if (c === 'merchants') { const ad = new Set((await db.collection('admins').get()).docs.map(d => d.id)); items = items.filter(m => !ad.has(m.id)); }   // un admin n'est jamais un marchand
    return Response.json({ items });
  } catch (e) { return fail(e); }
}
