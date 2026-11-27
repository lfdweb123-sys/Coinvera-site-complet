import { z } from 'zod';
import { guard, idOf, REF } from '@/lib/numbers/http';
import { reuseOrder } from '@/lib/numbers/orders';
// Rachat du même numéro (GET /user/reuse/{produit}/{numéro} chez 5sim), possible si le numéro a été acheté avec l'option de réutilisation.
export const POST = guard(async (req, ctx, u) => Response.json(await reuseOrder(u.uid, await idOf(ctx), z.object({ ref: REF }).parse(await req.json()).ref)));
