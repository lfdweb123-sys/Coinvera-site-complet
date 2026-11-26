import { guard, idOf } from '@/lib/proxnum/http';
import { extendOptions } from '@/lib/proxnum/orders';
export const GET = guard(async (_r, ctx, u) => Response.json({ options: await extendOptions(u.uid, await idOf(ctx)) }));
