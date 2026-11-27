import { rateLimit } from '@/lib/ratelimit';
import { guard, idOf } from '@/lib/esim/http';
import { cancelOrder } from '@/lib/esim/orders';
export const POST = guard(async (_r, ctx, u) => { await rateLimit('escancel_' + u.uid, 30, 3600); return Response.json(await cancelOrder(u.uid, await idOf(ctx))); });
