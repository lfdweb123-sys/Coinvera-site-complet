import { guard, idOf } from '@/lib/esim/http';
import { refreshOrder } from '@/lib/esim/orders';
// Détail d'une eSIM (QR code, code d'activation) : relit le prestataire au plus une fois toutes les 3 s pour la livraison, le statut et la consommation.
export const GET = guard(async (_r, ctx, u) => Response.json(await refreshOrder(u.uid, await idOf(ctx))));
