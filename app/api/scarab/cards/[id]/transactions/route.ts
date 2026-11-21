import { guard, idOf } from '@/lib/scarab/http';
import { cardTransactions } from '@/lib/scarab/cards';
export const GET = guard(async (req, ctx, u) => Response.json(await cardTransactions(u.uid, await idOf(ctx), new URL(req.url).searchParams.get('cursor') ?? undefined)));
