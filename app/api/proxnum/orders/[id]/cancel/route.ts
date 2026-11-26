import { rateLimit } from '@/lib/ratelimit';
import { guard, idOf } from '@/lib/proxnum/http';
import { cancelOrder } from '@/lib/proxnum/orders';
export const POST = guard(async (_r, ctx, u) => { await rateLimit('pxcancel_' + u.uid, 30, 3600); return Response.json(await cancelOrder(u.uid, await idOf(ctx))); });
