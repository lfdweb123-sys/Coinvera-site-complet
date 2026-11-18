import { z } from 'zod';
import { fail, requireUser } from '@/lib/auth';
import { checkOrder } from '@/lib/crypto-orders';
import { rateLimit } from '@/lib/ratelimit';
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const u = await requireUser(req); const { id } = await params; await rateLimit('cv_' + u.uid, 20, 600); const { txid } = z.object({ txid: z.string().min(20).max(120) }).parse(await req.json());
    return Response.json(await checkOrder(u.uid, id, txid));
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
