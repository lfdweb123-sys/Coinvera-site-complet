import { db } from '@/lib/firebase-admin';
import { fail, HttpError, requireUser } from '@/lib/auth';
async function own(req: Request, params: Promise<{ id: string }>) {
  const u = await requireUser(req); const { id } = await params; if (!/^[A-Za-z0-9]{10,40}$/.test(id)) throw new HttpError(404, 'not_found');
  const ref = db.doc(`ai_chats/${id}`); const s = await ref.get(); if (!s.exists || s.data()!.uid !== u.uid) throw new HttpError(404, 'not_found'); return { ref, d: s.data()! };
}
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const { d } = await own(req, params); return Response.json({ id: (await params).id, title: d.title, messages: d.messages ?? [] }); } catch (e) { return fail(e); }
}
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const { ref } = await own(req, params); await ref.delete(); return Response.json({ ok: true }); } catch (e) { return fail(e); }
}
