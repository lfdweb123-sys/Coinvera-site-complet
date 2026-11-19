import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, db } from '@/lib/firebase-admin';
import { fail, HttpError, requireSuper } from '@/lib/auth';
import { rateLimit } from '@/lib/ratelimit';
import { rows } from '@/lib/serialize';
import { audit } from '@/lib/audit';
export async function GET(req: Request) {
  try { await requireSuper(req); return Response.json({ items: rows(await db.collection('admins').get()) }); } catch (e) { return fail(e); }
}
export async function POST(req: Request) {
  try { const u = await requireSuper(req); await rateLimit('adm_' + u.uid, 20, 3600);
    const b = z.object({ email: z.string().email(), fullName: z.string().min(2).max(80), password: z.string().min(8).max(128) }).parse(await req.json());
    if (await adminAuth.getUserByEmail(b.email).then(() => true).catch(() => false)) throw new HttpError(409, 'email_in_use');
    const c = await adminAuth.createUser({ email: b.email, password: b.password, emailVerified: true, displayName: b.fullName }); await adminAuth.setCustomUserClaims(c.uid, { role: 'admin' });
    await db.doc(`admins/${c.uid}`).set({ email: b.email, fullName: b.fullName, status: 'active', super: false, twoFactor: false, createdAt: FieldValue.serverTimestamp() });
    await audit(u.uid, 'admin.created', { target: c.uid, email: b.email }); return Response.json({ id: c.uid }, { status: 201 });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
