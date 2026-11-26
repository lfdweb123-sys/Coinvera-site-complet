import { z } from 'zod';
import { rateLimit } from '@/lib/ratelimit';
import { EXPECTED, guard, REF } from '@/lib/proxnum/http';
import { buyRental } from '@/lib/proxnum/orders';
export const POST = guard(async (req, _c, u) => {
  const b = z.object({ ref: REF, service: z.string().regex(/^[A-Za-z0-9_]{1,16}$/), country: z.number().int().min(0), hours: z.number().int().positive(), expected: EXPECTED }).parse(await req.json());
  await rateLimit('pxbuy_' + u.uid, 30, 3600);
  return Response.json(await buyRental(u.uid, b), { status: 201 });
});
