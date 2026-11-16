import { FieldValue } from 'firebase-admin/firestore';
import { fail } from '@/lib/auth';
import { bad, lic } from '@/lib/license';
export async function POST(req: Request) {
  try { const { ref, site } = await lic(req); await ref.update({ sites: FieldValue.arrayRemove(site) }); return Response.json({ ok: true });
  } catch (e) { return bad(e) ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
