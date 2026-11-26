import { cronAllowed } from '@/lib/cron';
import { db } from '@/lib/firebase-admin';
import { warn } from '@/lib/log';
import { pollFiat } from '@/lib/fiat/orders';
import { checkPayOrder } from '@/lib/cards/pay';
import { reconcile } from '@/lib/cards/orders';
import { checkClose } from '@/lib/cards/cards';
// À planifier toutes les 2 à 5 minutes (Authorization: Bearer $CRON_SECRET). Filet de sécurité : tout ce que les webhooks auraient manqué est relu à la source.
export async function GET(req: Request) {
  if (!cronAllowed(req)) return new Response('forbidden', { status: 403 });
  const out = { payOrders: 0, orders: 0, closes: 0, errors: 0 };
  const run = async (n: 'payOrders' | 'orders' | 'closes', f: () => Promise<unknown>) => { try { await f(); out[n]++; } catch (e) { out.errors++; warn('cron.cards_item_failed', { n, message: (e as Error).message }); } };
  for (const st of ['awaiting', 'paid', 'expired']) for (const d of (await db.collection('card_pay_orders').where('status', '==', st).limit(200).get()).docs) await run('payOrders', () => checkPayOrder(null, d.id));
  for (const st of ['reserved', 'processing']) for (const d of (await db.collection('card_orders').where('status', '==', st).limit(50).get()).docs) await run('orders', () => reconcile(d.id));
  for (const d of (await db.collection('card_items').where('closeRequestedAt', '>', 0).limit(100).get()).docs) if (!d.data().closeCredited) await run('closes', () => checkClose(d.data().merchantId, Number(d.id)));
  const fiat = await pollFiat().catch(e => { warn('cron.fiat_failed', { message: (e as Error).message }); return 0; });   // dépôts mobile money / virement en attente : relus à la source
  return Response.json({ ...out, fiat });
}
