import { z } from 'zod';
import { rateLimit } from '@/lib/ratelimit';
import { EXPECTED, guard, REF } from '@/lib/esim/http';
import { buyEsim } from '@/lib/esim/orders';
export const POST = guard(async (req, _c, u) => {
  const b = z.object({ ref: REF, slug: z.string().regex(/^[A-Za-z0-9_.\-]{1,64}$/), days: z.number().int().min(1).max(365).optional(), expected: EXPECTED }).parse(await req.json());
  await rateLimit('esbuy_' + u.uid, 30, 3600);
  return Response.json(await buyEsim(u.uid, { ref: b.ref, slug: b.slug, days: b.days, expected: b.expected }), { status: 201 });
});
