import { db } from '@/lib/firebase-admin';
import { warn } from '@/lib/log';
import { checkPayOrder } from '@/lib/scarab/pay';
import { reconcile } from '@/lib/scarab/orders';
import { refreshCustomer } from '@/lib/scarab/customers';
import { flagStaleWithdrawals } from '@/lib/scarab/withdraw';
import { purgeExpiredCodes } from '@/lib/scarab/webhook';
// À planifier toutes les 2 à 5 minutes (Authorization: Bearer $CRON_SECRET). Filet de sécurité : tout ce que les webhooks auraient manqué est relu à la source.
export async function GET(req: Request) {
  const s = process.env.CRON_SECRET; if (!s || req.headers.get('authorization') !== `Bearer ${s}`) return new Response('unauthorized', { status: 401 });
  const out = { payOrders: 0, orders: 0, customers: 0, codes: 0, errors: 0 };
  const run = async (n: 'payOrders' | 'orders' | 'customers', f: () => Promise<unknown>) => { try { await f(); out[n]++; } catch (e) { out.errors++; warn('cron.scarab_item_failed', { n, message: (e as Error).message }); } };
  for (const st of ['awaiting', 'paid']) for (const d of (await db.collection('scarab_pay_orders').where('status', '==', st).limit(50).get()).docs) await run('payOrders', () => checkPayOrder(null, d.id));
  for (const st of ['reserved', 'processing']) for (const d of (await db.collection('scarab_orders').where('status', '==', st).limit(50).get()).docs) await run('orders', () => reconcile(d.id));
  for (const d of (await db.collection('scarab_customers').where('status', '==', 'creating').limit(20).get()).docs) await run('customers', () => refreshCustomer(d.id));
  await flagStaleWithdrawals().catch(() => 0);
  out.codes = await purgeExpiredCodes().catch(() => 0);
  return Response.json({ ok: true, ...out });
}
