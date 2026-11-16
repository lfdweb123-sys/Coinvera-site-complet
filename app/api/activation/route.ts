import { fail, requireUser } from '@/lib/auth';
import { startPurchase } from '@/lib/purchase';
import { rateLimit } from '@/lib/ratelimit';
export async function POST(req: Request) {
  try { const u = await requireUser(req); await rateLimit('buy_' + u.uid, 10, 3600);
    return Response.json({ checkoutUrl: await startPurchase(u.uid, u.merchant.email, 'activation') });
  } catch (e) { return fail(e); }
}
