import { db } from '@/lib/firebase-admin';
import { fail, requireUser } from '@/lib/auth';
import { rows } from '@/lib/serialize';
export async function GET(req: Request) {
  try { const u = await requireUser(req);
    return Response.json({ items: rows(await db.collection('ledger_entries').where('merchantId', '==', u.uid).orderBy('createdAt', 'desc').limit(100).get()) });
  } catch (e) { return fail(e); }
}
