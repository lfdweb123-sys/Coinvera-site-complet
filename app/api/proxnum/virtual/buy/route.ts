import { z } from 'zod';
import { rateLimit } from '@/lib/ratelimit';
import { EXPECTED, guard, REF } from '@/lib/proxnum/http';
import { buyVirtual } from '@/lib/proxnum/orders';
export const POST = guard(async (req, _c, u) => {
  const b = z.object({ ref: REF, service: z.string().regex(/^[A-Za-z0-9_]{1,16}$/), country: z.number().int().min(0), priceToken: z.string().max(400).optional(), expected: EXPECTED }).parse(await req.json());
  await rateLimit('pxbuy_' + u.uid, 30, 3600);
  return Response.json(await buyVirtual(u.uid, { ref: b.ref, service: b.service, country: b.country, token: b.priceToken, expected: b.expected }), { status: 201 });
});
