import { z } from 'zod';
import { rateLimit } from '@/lib/ratelimit';
import { guard, AMOUNT } from '@/lib/scarab/http';
import { createDepositOrder } from '@/lib/scarab/pay';
// Dépôt USDT sur l'adresse du programme : crédite le crédit Virtuals cards pro (suivi ensuite via GET /api/scarab/pay-orders/{id}).
export const POST = guard(async (req, _c, u) => {
  const b = z.object({ amount: AMOUNT, cur: z.string().max(20) }).parse(await req.json()); await rateLimit('scarabdep_' + u.uid, 10, 3600);
  return Response.json(await createDepositOrder(u.uid, b.cur, b.amount), { status: 201 });
});
