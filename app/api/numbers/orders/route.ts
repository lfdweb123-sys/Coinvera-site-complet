import { z } from 'zod';
import { byMerchant } from '@/lib/serialize';
import { guard, REF } from '@/lib/numbers/http';
import { createOrder, view } from '@/lib/numbers/orders';
// Historique de l'utilisateur (paginé).
export const GET = guard(async (req, _c, u) => {
  const r = await byMerchant('fivesim_orders', u.uid, req);
  return Response.json({ ...r, items: r.items.map((x: any) => view(x.id, x)) });
});
// Achat : montant réservé sur le solde disponible, numéro délivré, remboursement immédiat en cas d'échec.
const Body = z.object({ ref: REF, service: z.string().min(1).max(20), country: z.string().min(1).max(60), operator: z.string().max(60).optional(), reuse: z.boolean().optional(), voice: z.boolean().optional(), forwardingNumber: z.string().regex(/^\d{4,15}$/).optional() });
export const POST = guard(async (req, _c, u) => Response.json(await createOrder(u.uid, Body.parse(await req.json()))));
