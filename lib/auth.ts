import { adminAuth, db } from './firebase-admin';
import { info, warn, error } from './log';
export class HttpError extends Error { constructor(public status: number, public code: string) { super(code); } }
async function verify(req: Request, o: { mfa: boolean; verified: boolean }) {
  const t = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!t) throw new HttpError(401, 'unauthenticated');
  const dec = await adminAuth.verifyIdToken(t, true).catch((e: any) => { warn('auth.invalid_token', { reason: e?.code }); throw new HttpError(401, 'invalid_token'); });
  if (o.verified && !dec.email_verified) { warn('auth.email_not_verified', { uid: dec.uid }); throw new HttpError(403, 'email_not_verified'); }
  const m = await db.doc(`merchants/${dec.uid}`).get();
  if (!m.exists || (o.verified && m.data()?.status !== 'active')) { warn('auth.account_unavailable', { uid: dec.uid, exists: m.exists }); throw new HttpError(403, 'account_disabled'); }
  let mfaOk = true;
  if (m.data()?.twoFactor) mfaOk = (await db.doc(`mfa_sessions/${dec.uid}`).get()).data()?.authTime === dec.auth_time;
  if (o.mfa && !mfaOk) { warn('auth.mfa_required', { uid: dec.uid }); throw new HttpError(403, 'mfa_required'); }
  return { uid: dec.uid, role: (dec.role as string) ?? 'merchant', merchant: m.data()!, authTime: dec.auth_time as number, emailVerified: !!dec.email_verified, mfaOk, email: dec.email as string };
}
export const requireUser = (req: Request) => verify(req, { mfa: true, verified: true });
export const requireUserBasic = (req: Request) => verify(req, { mfa: false, verified: false });
export async function requireAdmin(req: Request) {
  const u = await requireUser(req);
  if (u.role !== 'admin') { warn('auth.forbidden_admin', { uid: u.uid }); throw new HttpError(403, 'forbidden'); }
  return u;
}
export const fail = (e: unknown) => {
  if (e instanceof HttpError) { if (e.status >= 500) error('http.error', { status: e.status, code: e.code }); else info('http.rejected', { status: e.status, code: e.code }); return Response.json({ error: e.code }, { status: e.status }); }
  const err = e as Error; error('unhandled', { message: err?.message, stack: String(err?.stack ?? '').split('\n').slice(0, 4).join(' | ') });
  return Response.json({ error: 'internal_error' }, { status: 500 });
};
