import { z } from 'zod';
import { db } from '@/lib/firebase-admin';
import { fail, requireAdmin } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { recentUpdates, resetUpdatesCache } from '@/lib/ai/updates';
// Nouveautés ajoutées par l'administrateur et transmises à Coinvera AI (voir lib/ai/updates.ts) : prises en compte au plus tard 5 minutes après l'enregistrement.
const Body = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), title: z.string().trim().min(3).max(120), text: z.string().trim().min(10).max(600), public: z.boolean() });
const Del = z.object({ id: z.string().min(1).max(60) });
export async function GET(req: Request) {
  try {
    await requireAdmin(req); const mine = await db.collection('kb_updates').limit(200).get();
    return Response.json({ items: mine.docs.map(d => ({ id: d.id, ...(d.data() as object) })).sort((a: any, b: any) => String(b.date).localeCompare(String(a.date))), seen: await recentUpdates(25) });
  } catch (e) { return fail(e); }
}
export async function POST(req: Request) {
  try {
    const a = await requireAdmin(req); const b = Body.parse(await req.json()); const ref = db.collection('kb_updates').doc();
    await ref.set({ ...b, active: true, createdAt: Date.now(), by: a.uid }); resetUpdatesCache(); await audit(a.uid, 'kb.update.add', { id: ref.id, title: b.title }).catch(() => {});
    return Response.json({ id: ref.id }, { status: 201 });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
export async function DELETE(req: Request) {
  try {
    const a = await requireAdmin(req); const { id } = Del.parse(await req.json()); await db.doc(`kb_updates/${id}`).update({ active: false }); resetUpdatesCache(); await audit(a.uid, 'kb.update.off', { id }).catch(() => {});
    return Response.json({ ok: true });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
