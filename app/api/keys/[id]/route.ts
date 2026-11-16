import { db } from '@/lib/firebase-admin';
import { fail, HttpError, requireUser } from '@/lib/auth';
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const u = await requireUser(req); const { id } = await params;
    const r = db.doc(`api_keys/${id}`); const k = await r.get();
    if (!k.exists || k.data()!.merchantId !== u.uid) throw new HttpError(404, 'not_found');
    await r.update({ status: 'revoked', revokedAt: new Date() });   // revocation immediate
    return Response.json({ ok: true });
  } catch (e) { return fail(e); }
}
