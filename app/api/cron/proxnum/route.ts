import { cronAllowed } from '@/lib/cron';
import { db } from '@/lib/firebase-admin';
import { warn } from '@/lib/log';
import { reconcilePendingCancel, reconcileReview, reconcileStalled } from '@/lib/proxnum/orders';
import { proxnumEnabled } from '@/lib/proxnum/api';
// À planifier toutes les 5 minutes sur cron-job.org (GET, en-tête Authorization: Bearer $CRON_SECRET). Filet de sécurité : relit à la source (ProxNum) tout achat d'issue incertaine et les annulations de location en attente.
export async function GET(req: Request) {
  if (!cronAllowed(req)) return new Response('forbidden', { status: 403 });
  if (!proxnumEnabled()) return Response.json({ ok: true, skipped: 'proxnum_disabled' });
  const out = { stalled: 0, review: 0, cancels: 0, errors: 0 };
  const run = async (n: 'stalled' | 'review' | 'cancels', f: () => Promise<unknown>) => { try { await f(); out[n]++; } catch (e) { out.errors++; warn('cron.proxnum_item_failed', { n, message: (e as Error).message }); } };
  for (const d of (await db.collection('proxnum_orders').where('status', '==', 'reserved').limit(50).get()).docs) await run('stalled', () => reconcileStalled(d.id));
  for (const d of (await db.collection('proxnum_orders').where('status', '==', 'review').limit(50).get()).docs) await run('review', () => reconcileReview(d.id));
  for (const d of (await db.collection('proxnum_orders').where('cancel', '==', 'pending').limit(50).get()).docs) await run('cancels', () => reconcilePendingCancel(d.id));
  return Response.json({ ok: true, ...out });
}
