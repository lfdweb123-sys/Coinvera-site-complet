import { guard, idOf } from '@/lib/proxnum/http';
import { refreshOrder } from '@/lib/proxnum/orders';
// Lecture d'une commande : interroge ProxNum (au plus une fois toutes les 3 s) pour le code SMS, le statut et l'expiration.
export const GET = guard(async (_r, ctx, u) => Response.json(await refreshOrder(u.uid, await idOf(ctx))));
