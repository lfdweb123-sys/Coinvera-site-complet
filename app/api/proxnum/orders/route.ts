import { byMerchant } from '@/lib/serialize';
import { guard } from '@/lib/proxnum/http';
import { view } from '@/lib/proxnum/orders';
// Historique de l'utilisateur (filtre ?kind=virtual|rental) ; les prolongations sont rattachées à leur location et n'apparaissent pas à part.
export const GET = guard(async (req, _c, u) => {
  const kind = new URL(req.url).searchParams.get('kind'); const r = await byMerchant('proxnum_orders', u.uid, req, (x: any) => x.kind !== 'extend' && (!kind || x.kind === kind));
  return Response.json({ ...r, items: r.items.map((x: any) => view(x.id, x)) });
});
