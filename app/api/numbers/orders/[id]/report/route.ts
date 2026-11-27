import { guard, idOf } from '@/lib/numbers/http';
import { reportUsed } from '@/lib/numbers/orders';
// « Numéro déjà utilisé » (GET /user/ban/{id} chez 5sim) : le numéro est signalé, remboursement immédiat.
export const POST = guard(async (_req, ctx, u) => Response.json(await reportUsed(u.uid, await idOf(ctx))));
