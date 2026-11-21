import { rateLimit } from '@/lib/ratelimit';
import { guard } from '@/lib/scarab/http';
import { CUSTOMER_FIELDS, createCustomer, refreshCustomer, resubmitCustomer, customerView, getCustomer } from '@/lib/scarab/customers';
// Dossier d'identité du titulaire (mode de vérification « merchant »). Le numéro de pièce et les photos passent par ici UNE fois et ne sont jamais conservés.
export const GET = guard(async (_r, _c, u) => Response.json({ customer: (await refreshCustomer(u.uid).catch(async () => customerView(await getCustomer(u.uid)))) }));
export const POST = guard(async (req, _c, u) => {
  const b = CUSTOMER_FIELDS.parse(await req.json()); await rateLimit('scarabcust_' + u.uid, 5, 86400);
  return Response.json({ customer: await createCustomer(u.uid, b) }, { status: 202 });
});
// Après un refus : correction des informations puis nouvelle vérification.
export const PUT = guard(async (req, _c, u) => {
  const b = CUSTOMER_FIELDS.partial().parse(await req.json()); await rateLimit('scarabkyc_' + u.uid, 10, 86400);
  return Response.json({ customer: await resubmitCustomer(u.uid, b) }, { status: 202 });
});
