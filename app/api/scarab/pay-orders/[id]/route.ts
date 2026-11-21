import { guard } from '@/lib/scarab/http';
import { checkPayOrder } from '@/lib/scarab/pay';
export const GET = guard(async (_r, ctx, u) => Response.json(await checkPayOrder(u.uid, String((await ctx.params).id))));
