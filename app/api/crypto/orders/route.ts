import { z } from 'zod';
import { fail, requireUser } from '@/lib/auth';
import { createOrder } from '@/lib/crypto-orders';
import { rateLimit } from '@/lib/ratelimit';
export async function POST(req: Request) {
  try { const u = await requireUser(req); await rateLimit('co_' + u.uid, 20, 3600); const b = z.object({ cur: z.string(), purpose: z.enum(['api', 'plugin']).default('api') }).parse(await req.json());
    return Response.json(await createOrder(u.uid, b.cur, b.purpose), { status: 201 });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
