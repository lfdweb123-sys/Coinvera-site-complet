import { z } from 'zod';
import { db } from '@/lib/firebase-admin';
import { fail, requireSuper } from '@/lib/auth';
import { audit } from '@/lib/audit';
// Suppression d'une ou plusieurs entrees du journal d'audit (ou de tout le journal). Reservee a l'administrateur principal ; une trace de la purge est conservee.
export async function DELETE(req: Request) {
  try { const u = await requireSuper(req); const b = z.object({ ids: z.array(z.string()).max(500).optional(), all: z.boolean().optional() }).parse(await req.json()); let n = 0;
    if (b.ids?.length) { const batch = db.batch(); b.ids.forEach(id => batch.delete(db.doc(`audit_logs/${id}`))); await batch.commit(); n = b.ids.length; }
    else if (b.all) { for (let i = 0; i < 20; i++) { const s = await db.collection('audit_logs').limit(400).get(); if (s.empty) break; const batch = db.batch(); s.docs.forEach(d => batch.delete(d.ref)); await batch.commit(); n += s.size; } }
    await audit(u.uid, 'audit_logs.deleted', { mode: b.all ? 'all' : 'selection', count: n }); return Response.json({ ok: true, deleted: n });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
