import { rateLimit } from '@/lib/ratelimit';
import { guard, intParam, strParam } from '@/lib/esim/http';
import { quote } from '@/lib/esim/orders';
// Prix exact (remise de palier comprise) d'un forfait « par jour » pour une durée donnée, ou d'une recharge (?order=). Le prix affiché est celui que le serveur facturera.
export const GET = guard(async (req, _c, u) => {
  const p = new URL(req.url).searchParams; await rateLimit('esquote_' + u.uid, 240, 600);
  return Response.json(await quote(u.uid, { slug: strParam(p, 'slug', 64), days: p.has('days') ? intParam(p, 'days', 0) : undefined, orderId: strParam(p, 'order', 120) || undefined }));
});
