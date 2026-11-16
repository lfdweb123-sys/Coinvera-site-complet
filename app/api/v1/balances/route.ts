import { db } from '@/lib/firebase-admin';
import { verifyApiRequest } from '@/lib/apikey';
import { fail } from '@/lib/auth';
import { fromUnits } from '@/lib/money';
export async function GET(req: Request) {
  try { const a = await verifyApiRequest(req, ''); const b = (await db.doc(`balances/${a.merchantId}`).get()).data() ?? {};
    return Response.json({ currency: 'USD', available: fromUnits(b.available ?? 0), reserved: fromUnits(b.reserved ?? 0) });
  } catch (e) { return fail(e); }
}
