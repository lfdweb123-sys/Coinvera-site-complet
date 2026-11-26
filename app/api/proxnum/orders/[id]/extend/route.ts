import { z } from 'zod';
import { rateLimit } from '@/lib/ratelimit';
import { EXPECTED, guard, idOf, REF } from '@/lib/proxnum/http';
import { extendRental } from '@/lib/proxnum/orders';
export const POST = guard(async (req, ctx, u) => {
  const b = z.object({ ref: REF, hours: z.number().int().positive(), expected: EXPECTED }).parse(await req.json()); await rateLimit('pxbuy_' + u.uid, 30, 3600);
  return Response.json(await extendRental(u.uid, await idOf(ctx), b), { status: 201 });
});
