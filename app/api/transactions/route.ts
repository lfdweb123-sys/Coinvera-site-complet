import { db } from '@/lib/firebase-admin';
import { fail, requireUser } from '@/lib/auth';
import { rows } from '@/lib/serialize';
export async function GET(req: Request) {
  try { const u = await requireUser(req);
    const s = await db.collection('transactions').where('merchantId', '==', u.uid).orderBy('createdAt', 'desc').limit(200).get();
    return Response.json({ items: rows(s).filter((x: any) => !x.purpose) });
  } catch (e) { return fail(e); }
}
