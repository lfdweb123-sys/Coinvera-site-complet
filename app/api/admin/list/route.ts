import { db } from '@/lib/firebase-admin';
import { fail, HttpError, requireAdmin } from '@/lib/auth';
import { rows } from '@/lib/serialize';
const OK: Record<string, boolean> = { transactions: true, withdrawals: true, balances: false, api_keys: true, api_activations: false, notifications: true, audit_logs: true, woocommerce_licenses: true, support_tickets: true, merchants: true, webhook_events: true };
export async function GET(req: Request) {
  try { await requireAdmin(req); const c = new URL(req.url).searchParams.get('c') ?? '';
    if (!(c in OK)) throw new HttpError(400, 'unknown_collection');
    const q = OK[c] ? db.collection(c).orderBy('createdAt', 'desc') : db.collection(c);
    return Response.json({ items: rows(await q.limit(100).get()) });
  } catch (e) { return fail(e); }
}
