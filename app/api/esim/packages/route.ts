import { guard, intParam, strParam } from '@/lib/esim/http';
import { searchPlans } from '@/lib/esim/pricing';
// Catalogue filtré pour le tableau de bord : recherche, portée (pays / régional / mondial), région, volume, validité, tri, pagination. Prix = prix prestataire + marge, calculés côté serveur.
export const GET = guard(async req => {
  const u = new URL(req.url).searchParams;
  return Response.json(await searchPlans({ q: strParam(u, 'q'), scope: strParam(u, 'scope', 12), region: strParam(u, 'region', 20), data: strParam(u, 'data', 8), days: strParam(u, 'days', 8), sort: strParam(u, 'sort', 12), page: intParam(u, 'page', 1), size: intParam(u, 'size', 20) }));
});
