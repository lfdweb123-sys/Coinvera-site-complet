import { db } from '@/lib/firebase-admin';
import { verifyApiRequest } from '@/lib/apikey';
import { fail } from '@/lib/auth';
export async function GET(req: Request) {
  try { const a = await verifyApiRequest(req, '');
    const [m, act] = await Promise.all([db.doc(`merchants/${a.merchantId}`).get(), db.doc(`api_activations/${a.merchantId}`).get()]);
    return Response.json({ merchantCode: m.data()?.merchantCode, company: m.data()?.company, keyMode: a.mode, apiActivated: !!act.data()?.activated, trialsUsed: act.data()?.trialsUsed ?? 0 });
  } catch (e) { return fail(e); }
}
