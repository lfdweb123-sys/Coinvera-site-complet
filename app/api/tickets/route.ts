import { db } from '@/lib/firebase-admin';
import { fail, requireUser } from '@/lib/auth';
import { byMerchant } from '@/lib/serialize';
export async function GET(req: Request) {
  try { const u = await requireUser(req);
    return Response.json({ items: await byMerchant('support_tickets', u.uid) });
  } catch (e) { return fail(e); }
}
