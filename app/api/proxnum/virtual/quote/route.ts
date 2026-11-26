import { z } from 'zod';
import { guard } from '@/lib/proxnum/http';
import { virtualQuote } from '@/lib/proxnum/pricing';
// Prix affiché avant achat : les libellés des routes (price_options) sont montrés tels quels, jamais un nom de fournisseur amont.
export const GET = guard(async req => {
  const q = new URL(req.url).searchParams, service = z.string().regex(/^[A-Za-z0-9_]{1,16}$/).parse(q.get('service')), country = z.coerce.number().int().min(0).parse(q.get('country'));
  const r = await virtualQuote(service, country); return Response.json({ price: r.price, total: r.chargeUnits, options: r.options });
});
