import { db } from '@/lib/firebase-admin';
import { verifyApiRequest } from '@/lib/apikey';
import { fail } from '@/lib/auth';
import { rows } from '@/lib/serialize';
export async function GET(req: Request) {
  try { const a = await verifyApiRequest(req, '');
    const s = await db.collection('transactions').where('merchantId', '==', a.merchantId).orderBy('createdAt', 'desc').limit(50).get();
    return Response.json({ data: rows(s).filter((x: any) => !x.purpose).map(({ merchantId, processorChargeId, ...x }: any) => x) });
  } catch (e) { return fail(e); }
}
