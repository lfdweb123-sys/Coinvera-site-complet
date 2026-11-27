import { guard, idOf } from '@/lib/numbers/http';
import { cancelOrder } from '@/lib/numbers/orders';
// Annulation (GET /user/cancel/{id} chez 5sim) : remboursement immédiat ; refusée si le code est déjà arrivé.
export const POST = guard(async (_req, ctx, u) => Response.json(await cancelOrder(u.uid, await idOf(ctx))));
