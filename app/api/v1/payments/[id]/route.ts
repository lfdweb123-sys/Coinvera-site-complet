import { db } from '@/lib/firebase-admin';
import { verifyApiRequest } from '@/lib/apikey';
import { fail, HttpError } from '@/lib/auth';
import { ser } from '@/lib/serialize';
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const a = await verifyApiRequest(req, ''); const { id } = await params;
    const d = (await db.doc(`transactions/${id}`).get()).data();
    if (!d || d.merchantId !== a.merchantId || d.purpose) throw new HttpError(404, 'not_found');   // jamais les donnees d'un autre marchand
    const { merchantId, processorChargeId, ...pub } = d;
    return Response.json({ id, ...ser(pub) });
  } catch (e) { return fail(e); }
}
