import { adminAuth, db } from './firebase-admin';
export class HttpError extends Error { constructor(public status: number, public code: string) { super(code); } }
export async function requireUser(req: Request) {
  const t = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!t) throw new HttpError(401, 'unauthenticated');
  const dec = await adminAuth.verifyIdToken(t, true).catch(() => { throw new HttpError(401, 'invalid_token'); });
  if (!dec.email_verified) throw new HttpError(403, 'email_not_verified');
  const m = await db.doc(`merchants/${dec.uid}`).get();
  if (!m.exists || m.data()?.status !== 'active') throw new HttpError(403, 'account_disabled');
  return { uid: dec.uid, role: (dec.role as string) ?? 'merchant', merchant: m.data()! };
}
export async function requireAdmin(req: Request) {
  const u = await requireUser(req);
  if (u.role !== 'admin') throw new HttpError(403, 'forbidden');
  return u;
}
export const fail = (e: unknown) => e instanceof HttpError
  ? Response.json({ error: e.code }, { status: e.status }) : (console.error(e), Response.json({ error: 'internal_error' }, { status: 500 }));
