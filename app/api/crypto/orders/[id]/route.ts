import { fail, requireUser } from '@/lib/auth';
import { checkOrder } from '@/lib/crypto-orders';
import { rateLimit } from '@/lib/ratelimit';
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const u = await requireUser(req); const { id } = await params; await rateLimit('cc_' + id, 30, 60); return Response.json(await checkOrder(u.uid, id)); } catch (e) { return fail(e); }
}
