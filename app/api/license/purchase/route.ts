import { db } from '@/lib/firebase-admin';
import { fail, requireUser } from '@/lib/auth';
import { rows } from '@/lib/serialize';
export async function GET(req: Request) {
  try { const u = await requireUser(req); return Response.json({ items: rows(await db.collection('woocommerce_licenses').where('merchantId', '==', u.uid).get()) }); } catch (e) { return fail(e); }
}
