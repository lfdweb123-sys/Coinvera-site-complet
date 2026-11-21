import { z } from 'zod';
import { rateLimit } from '@/lib/ratelimit';
import { guard, AMOUNT } from '@/lib/cards/http';
import { createDepositOrder } from '@/lib/cards/pay';
// Recharge du crédit cartes en USDT (suivi ensuite via GET /api/cards/pay-orders/{id}).
export const POST = guard(async (req, _c, u) => {
  const b = z.object({ amount: AMOUNT, cur: z.string().max(20) }).parse(await req.json()); await rateLimit('carddep_' + u.uid, 10, 3600);
  return Response.json(await createDepositOrder(u.uid, b.cur, b.amount), { status: 201 });
});
