import { z } from 'zod';
import { rateLimit } from '@/lib/ratelimit';
import { guard, SPEC } from '@/lib/scarab/http';
import { createPayOrder, payCurrencies } from '@/lib/scarab/pay';
export const GET = guard(async () => Response.json({ currencies: payCurrencies() }));
export const POST = guard(async (req, _c, u) => {
  const b = SPEC.extend({ cur: z.string().max(20) }).parse(await req.json()); await rateLimit('scarabpay_' + u.uid, 10, 3600);
  const { cur, ...spec } = b; return Response.json(await createPayOrder(u.uid, cur, spec), { status: 201 });
});
