import { z } from 'zod';
import { rateLimit } from '@/lib/ratelimit';
import { EXPECTED, guard, REF } from '@/lib/esim/http';
import { buyEsim } from '@/lib/esim/orders';
export const POST = guard(async (req, _c, u) => {
  const b = z.object({ ref: REF, slug: z.string().regex(/^[A-Za-z0-9_.\-]{1,64}$/), expected: EXPECTED }).parse(await req.json());
  await rateLimit('esbuy_' + u.uid, 30, 3600);
  return Response.json(await buyEsim(u.uid, { ref: b.ref, slug: b.slug, expected: b.expected }), { status: 201 });
});
