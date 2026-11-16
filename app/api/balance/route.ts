import { db } from '@/lib/firebase-admin';
import { fail, requireUser } from '@/lib/auth';
import { fromUnits } from '@/lib/money';
export async function GET(req: Request) {
  try { const u = await requireUser(req); const b = (await db.doc(`balances/${u.uid}`).get()).data() ?? {};
    const f = (k: string) => fromUnits(b[k] ?? 0);
    return Response.json({ available: f('available'), reserved: f('reserved'), totalReceived: f('totalReceived'), totalWithdrawn: f('totalWithdrawn'), feesPaid: f('feesPaid') });
  } catch (e) { return fail(e); }
}
