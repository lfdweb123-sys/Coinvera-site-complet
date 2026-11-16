import { fail, requireUser } from '@/lib/auth';
import { startPurchase } from '@/lib/purchase';
import { rateLimit } from '@/lib/ratelimit';
import { db } from '@/lib/firebase-admin';
import { rows } from '@/lib/serialize';
export async function POST(req: Request) {
  try { const u = await requireUser(req); await rateLimit('buy_' + u.uid, 10, 3600);
    return Response.json({ checkoutUrl: await startPurchase(u.uid, u.merchant.email, 'license') });
  } catch (e) { return fail(e); }
}
export async function GET(req: Request) {
  try { const u = await requireUser(req);
    return Response.json({ items: rows(await db.collection('woocommerce_licenses').where('merchantId', '==', u.uid).get()) });
  } catch (e) { return fail(e); }
}
