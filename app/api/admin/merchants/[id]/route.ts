import { z } from 'zod';
import { adminAuth, db } from '@/lib/firebase-admin';
import { fail, HttpError, requireAdmin } from '@/lib/auth';
import { audit } from '@/lib/audit';
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const a = await requireAdmin(req); const { id } = await params; const { status } = z.object({ status: z.enum(['active', 'suspended']) }).parse(await req.json());
    if ((await db.doc(`admins/${id}`).get()).exists) throw new HttpError(403, 'protected_admin');
    await db.doc(`merchants/${id}`).update({ status, updatedAt: new Date() });
    await adminAuth.updateUser(id, { disabled: status === 'suspended' }); if (status === 'suspended') await adminAuth.revokeRefreshTokens(id);
    await audit(a.uid, 'merchant.' + status, { merchantId: id });
    return Response.json({ ok: true });
  } catch (e) { return fail(e); }
}
