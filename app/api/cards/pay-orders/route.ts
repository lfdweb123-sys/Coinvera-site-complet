import { z } from 'zod';
import { rateLimit } from '@/lib/ratelimit';
import { guard, SPEC } from '@/lib/cards/http';
import { createPayOrder, payCurrencies } from '@/lib/cards/pay';
export const GET = guard(async () => Response.json({ currencies: await payCurrencies() }));
export const POST = guard(async (req, _c, u) => {
  const b = SPEC.extend({ cur: z.string().max(20) }).parse(await req.json()); await rateLimit('cardpay_' + u.uid, 10, 3600);
  const { cur, ...spec } = b; return Response.json(await createPayOrder(u.uid, cur, spec), { status: 201 });
});
