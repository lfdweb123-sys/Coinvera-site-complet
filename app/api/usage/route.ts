import { db } from '@/lib/firebase-admin';
import { fail, requireUser } from '@/lib/auth';
import { rows } from '@/lib/serialize';
export async function GET(req: Request) {
  try { const u = await requireUser(req); const t = new URL(req.url).searchParams.get('type') === 'webhooks' ? 'webhook_events' : 'api_usage';
    return Response.json({ items: rows(await db.collection(t).where('merchantId', '==', u.uid).orderBy('createdAt', 'desc').limit(100).get()) });
  } catch (e) { return fail(e); }
}
