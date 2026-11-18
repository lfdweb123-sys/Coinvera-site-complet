import { z } from 'zod';
import { db } from '@/lib/firebase-admin';
import { fail, HttpError, requireUser } from '@/lib/auth';
import { info } from '@/lib/log';
async function own(req: Request, id: string) { const u = await requireUser(req); const r = db.doc(`payment_links/${id}`); const d = (await r.get()).data(); if (!d || d.merchantId !== u.uid || d.deleted) throw new HttpError(404, 'not_found'); return { r, u }; }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const { id } = await params; const { r, u } = await own(req, id); const { active } = z.object({ active: z.boolean() }).parse(await req.json()); await r.update({ active }); info('link.toggled', { linkId: id, merchantId: u.uid, active }); return Response.json({ ok: true }); } catch (e) { return fail(e); }
}
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const { id } = await params; const { r, u } = await own(req, id); await r.update({ deleted: true, active: false }); info('link.deleted', { linkId: id, merchantId: u.uid }); return Response.json({ ok: true }); } catch (e) { return fail(e); }
}
