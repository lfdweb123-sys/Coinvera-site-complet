import { rateLimit } from '@/lib/ratelimit';
import { guard, idOf } from '@/lib/cards/http';
import { closeCard, closeQuote } from '@/lib/cards/cards';
export const GET = guard(async (_r, ctx, u) => Response.json(await closeQuote(u.uid, await idOf(ctx))));
export const POST = guard(async (_r, ctx, u) => { await rateLimit('cardclose_' + u.uid, 10, 3600); return Response.json(await closeCard(u.uid, await idOf(ctx))); });
