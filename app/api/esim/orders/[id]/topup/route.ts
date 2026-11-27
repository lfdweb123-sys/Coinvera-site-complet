import { z } from 'zod';
import { rateLimit } from '@/lib/ratelimit';
import { EXPECTED, guard, idOf, REF } from '@/lib/esim/http';
import { topupEsim } from '@/lib/esim/orders';
export const POST = guard(async (req, ctx, u) => {
  const b = z.object({ ref: REF, slug: z.string().regex(/^[A-Za-z0-9_.\-]{1,64}$/), days: z.number().int().min(1).max(365).optional(), expected: EXPECTED }).parse(await req.json());
  await rateLimit('estopup_' + u.uid, 30, 3600);
  return Response.json(await topupEsim(u.uid, await idOf(ctx), b), { status: 201 });
});
