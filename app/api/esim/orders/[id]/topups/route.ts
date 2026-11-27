import { guard, idOf } from '@/lib/esim/http';
import { topupOptions } from '@/lib/esim/orders';
// Recharges proposées pour cette eSIM (relues chez le prestataire).
export const GET = guard(async (_r, ctx, u) => Response.json(await topupOptions(u.uid, await idOf(ctx))));
