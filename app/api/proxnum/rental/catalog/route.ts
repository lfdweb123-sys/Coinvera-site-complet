import { z } from 'zod';
import { guard } from '@/lib/proxnum/http';
import { rentalCatalog } from '@/lib/proxnum/pricing';
export const GET = guard(async req => {
  const q = new URL(req.url).searchParams, country = q.get('country') ? z.coerce.number().int().min(0).parse(q.get('country')) : undefined, hours = q.get('hours') ? z.coerce.number().int().positive().parse(q.get('hours')) : undefined;
  const c = await rentalCatalog(country === undefined ? undefined : String(country), hours);
  return Response.json({ ...c, services: c.services.map(({ code, name, price, stock }: any) => ({ code, name, price, stock })) });   // les prix prestataire (costUnits, providerPrice) ne quittent jamais le serveur
});
