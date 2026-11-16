import { db } from '@/lib/firebase-admin';
import { fail, HttpError, requireAdmin } from '@/lib/auth';
import { audit } from '@/lib/audit';
// Remet un retrait 'needs_review' en file. Pas de doublon possible : le requestId Bybit est identique (idempotent).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const a = await requireAdmin(req); const { id } = await params; const r = db.doc(`withdrawals/${id}`);
    if ((await r.get()).data()?.status !== 'needs_review') throw new HttpError(400, 'not_reviewable');
    await r.update({ status: 'queued' }); await audit(a.uid, 'withdrawal.requeue', { id });
    return Response.json({ ok: true });
  } catch (e) { return fail(e); }
}
