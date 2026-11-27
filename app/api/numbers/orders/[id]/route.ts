import { guard, idOf } from '@/lib/numbers/http';
import { getOrder } from '@/lib/numbers/orders';
// Relit la commande chez 5sim (code reçu, annulée, expirée…) et en tire les conséquences comptables avant de répondre.
export const GET = guard(async (_req, ctx, u) => Response.json(await getOrder(u.uid, await idOf(ctx))));
