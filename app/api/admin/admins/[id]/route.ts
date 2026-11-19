import { z } from 'zod';
import { adminAuth, db } from '@/lib/firebase-admin';
import { fail, HttpError, requireSuper } from '@/lib/auth';
import { audit } from '@/lib/audit';
async function target(id: string) { const r = db.doc(`admins/${id}`); const d = (await r.get()).data(); if (!d) throw new HttpError(404, 'not_found'); if (d.super) throw new HttpError(403, 'protected_admin'); return { r, d }; }   // l'admin principal est intouchable
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const u = await requireSuper(req); const { id } = await params; const { r } = await target(id);
    const b = z.object({ fullName: z.string().min(2).max(80).optional(), email: z.string().email().optional(), password: z.string().min(8).max(128).optional(), status: z.enum(['active', 'suspended']).optional() }).parse(await req.json());
    const up: any = {}; if (b.fullName) up.displayName = b.fullName; if (b.email) { up.email = b.email; up.emailVerified = true; } if (b.password) up.password = b.password; if (b.status) up.disabled = b.status === 'suspended';
    if (Object.keys(up).length) await adminAuth.updateUser(id, up); if (b.status === 'suspended' || b.password || b.email) await adminAuth.revokeRefreshTokens(id);
    const doc: any = { updatedAt: new Date() }; if (b.fullName) doc.fullName = b.fullName; if (b.email) doc.email = b.email; if (b.status) doc.status = b.status; await r.update(doc);
    await audit(u.uid, 'admin.updated', { target: id, fields: Object.keys(b).filter(k => k !== 'password'), passwordChanged: !!b.password }); return Response.json({ ok: true });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const u = await requireSuper(req); const { id } = await params; const { r, d } = await target(id);
    await adminAuth.revokeRefreshTokens(id).catch(() => {}); await adminAuth.deleteUser(id).catch(() => {}); await r.delete(); await audit(u.uid, 'admin.deleted', { target: id, email: d.email }); return Response.json({ ok: true });
  } catch (e) { return fail(e); }
}
