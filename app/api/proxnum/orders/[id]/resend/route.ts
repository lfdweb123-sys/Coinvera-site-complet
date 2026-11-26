import { rateLimit } from '@/lib/ratelimit';
import { guard, idOf } from '@/lib/proxnum/http';
import { resendOrder } from '@/lib/proxnum/orders';
export const POST = guard(async (_r, ctx, u) => { await rateLimit('pxresend_' + u.uid, 20, 3600); return Response.json(await resendOrder(u.uid, await idOf(ctx))); });
