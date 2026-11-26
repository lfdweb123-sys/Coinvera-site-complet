import { z } from 'zod';
import { db } from '@/lib/firebase-admin';
import { fail, HttpError, requireAdmin } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { finishWithdrawal } from '@/lib/withdraw';
// Validation manuelle des retraits par adresse (Admin > Retraits).
//  approve : vous avez envoyé les fonds vous-même (hash obligatoire) -> retrait terminé, reçu envoyé à l'utilisateur ;
//  reject  : refus -> les fonds sont remis sur le solde disponible de l'utilisateur ;
//  requeue : (sans corps = ancien comportement) remet en file pour l'envoi automatique par Bybit ; sans risque de doublon (identifiant de retrait unique).
const Body = z.discriminatedUnion('action', [z.object({ action: z.literal('approve'), txHash: z.string().trim().min(8).max(160).regex(/^[0-9A-Za-z:_\-./]+$/) }), z.object({ action: z.literal('reject'), reason: z.string().trim().min(3).max(200) }), z.object({ action: z.literal('requeue') })]);
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const a = await requireAdmin(req); const { id } = await params; const r = db.doc(`withdrawals/${id}`); const w = (await r.get()).data(); if (!w) throw new HttpError(404, 'not_found');
    const raw = await req.text(); const b = Body.parse(raw ? JSON.parse(raw) : { action: 'requeue' });
    if (b.action === 'requeue') { if (!['needs_review', 'pending_admin'].includes(w.status)) throw new HttpError(400, 'not_reviewable'); await r.update({ status: 'queued' }); await audit(a.uid, 'withdrawal.requeue', { id }); return Response.json({ ok: true }); }
    if (!['pending_admin', 'needs_review'].includes(w.status)) throw new HttpError(400, 'not_reviewable');
    if (b.action === 'approve') { await finishWithdrawal(id, true, { txHash: b.txHash, manual: true, approvedBy: a.uid }); await audit(a.uid, 'withdrawal.approve', { id, txHash: b.txHash, address: w.address, amountUnits: w.amountUnits }); }
    else { await finishWithdrawal(id, false, { error: 'rejected_by_admin', reason: b.reason, rejectedBy: a.uid }, b.reason); await audit(a.uid, 'withdrawal.reject', { id, reason: b.reason }); }
    return Response.json({ ok: true });
  } catch (e) { return e instanceof z.ZodError || e instanceof SyntaxError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
