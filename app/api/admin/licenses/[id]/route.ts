import { db } from '@/lib/firebase-admin';
import { fail, requireAdmin } from '@/lib/auth';
import { audit } from '@/lib/audit';
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const a = await requireAdmin(req); const { id } = await params;
    await db.doc(`woocommerce_licenses/${id}`).update({ status: 'revoked', revokedAt: new Date() }); await audit(a.uid, 'license.revoke', { id });
    return Response.json({ ok: true });
  } catch (e) { return fail(e); }
}
