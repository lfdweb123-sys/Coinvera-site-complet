import { z } from 'zod';
import { rateLimit } from '@/lib/ratelimit';
import { AMOUNT, guard, SCOPE } from '@/lib/fiat/http';
import { createFiatOrder } from '@/lib/fiat/orders';
// Création d'un dépôt mobile money / virement : l'utilisateur est ensuite suivi via GET /api/fiat/orders/{id}.
const Body = z.object({ scope: SCOPE, method: z.string().max(40), amount: AMOUNT, phone: z.string().max(24).optional(), otp: z.string().max(10).optional(), bankCode: z.string().max(16).optional() });
export const POST = guard(async (req, _c, u) => {
  const b = Body.parse(await req.json()); await rateLimit('fiato_' + u.uid, 10, 3600);
  return Response.json(await createFiatOrder({ uid: u.uid, email: u.email, merchant: u.merchant }, b.scope, b.method, b.amount, { phone: b.phone, otp: b.otp, bankCode: b.bankCode }), { status: 201 });
}, async req => SCOPE.parse((await req.clone().json().catch(() => ({}))).scope));
