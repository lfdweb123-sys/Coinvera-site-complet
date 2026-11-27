import { guard, intParam, strParam } from '@/lib/esim/http';
import { listOrders } from '@/lib/esim/orders';
// Mes eSIM : liste paginée de l'utilisateur (filtres ?q= recherche, ?state= état). Le code d'activation n'est jamais renvoyé dans la liste.
export const GET = guard(async (req, _c, u) => {
  const p = new URL(req.url).searchParams;
  return Response.json(await listOrders(u.uid, { page: intParam(p, 'page', 1), size: intParam(p, 'size', 10), q: strParam(p, 'q'), state: strParam(p, 'state', 12) }));
});
