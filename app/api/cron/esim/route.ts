import { cronAllowed } from '@/lib/cron';
import { db } from '@/lib/firebase-admin';
import { warn } from '@/lib/log';
import { reconcileOrdered, reconcileReview, reconcileStalled } from '@/lib/esim/orders';
import { esimEnabled } from '@/lib/esim/api';
// À planifier toutes les 5 minutes sur cron-job.org (GET, en-tête Authorization: Bearer $CRON_SECRET). Filet de sécurité : relit à la source (eSIM Access) toute commande d'issue incertaine ou dont l'eSIM n'est pas encore livrée.
export async function GET(req: Request) {
  if (!cronAllowed(req)) return new Response('forbidden', { status: 403 });
  if (!esimEnabled()) return Response.json({ ok: true, skipped: 'esim_disabled' });
  const out = { stalled: 0, review: 0, ordered: 0, errors: 0 };
  const run = async (n: 'stalled' | 'review' | 'ordered', f: () => Promise<unknown>) => { try { await f(); out[n]++; } catch (e) { out.errors++; warn('cron.esim_item_failed', { n, message: (e as Error).message }); } };
  for (const d of (await db.collection('esim_orders').where('status', '==', 'reserved').limit(50).get()).docs) await run('stalled', () => reconcileStalled(d.id));
  for (const d of (await db.collection('esim_orders').where('status', '==', 'review').limit(50).get()).docs) await run('review', () => reconcileReview(d.id));
  for (const d of (await db.collection('esim_orders').where('status', '==', 'ordered').limit(50).get()).docs) await run('ordered', () => reconcileOrdered(d.id));
  return Response.json({ ok: true, ...out });
}
