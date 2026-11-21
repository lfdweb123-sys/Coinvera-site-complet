import { guard, idOf } from '@/lib/cards/http';
import { cardDetails } from '@/lib/cards/cards';
export const GET = guard(async (_r, ctx, u) => Response.json(await cardDetails(u.uid, await idOf(ctx))));
