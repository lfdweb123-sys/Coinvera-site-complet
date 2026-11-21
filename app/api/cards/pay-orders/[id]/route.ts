import { guard } from '@/lib/cards/http';
import { checkPayOrder } from '@/lib/cards/pay';
export const GET = guard(async (_r, ctx, u) => Response.json(await checkPayOrder(u.uid, String((await ctx.params).id))));
