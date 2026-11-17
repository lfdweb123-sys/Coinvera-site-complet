import { z } from 'zod';
import { fail, requireUser } from '@/lib/auth';
import { toUnits } from '@/lib/money';
import { byMerchant } from '@/lib/serialize';
import { rateLimit } from '@/lib/ratelimit';
import { requestWithdrawal } from '@/lib/withdraw';
const Body = z.object({ chain: z.string(), address: z.string().min(20).max(120), amount: z.number().positive() });
export async function POST(req: Request) {
  try { const u = await requireUser(req); await rateLimit('wd_' + u.uid, 10, 3600); const b = Body.parse(await req.json());
    const id = await requestWithdrawal(u.uid, { chain: b.chain, address: b.address, amountUnits: toUnits(b.amount) });
    return Response.json({ id, status: 'queued' }, { status: 201 });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
export async function GET(req: Request) {
  try { const u = await requireUser(req); return Response.json(await byMerchant('withdrawals', u.uid, req)); } catch (e) { return fail(e); }
}
