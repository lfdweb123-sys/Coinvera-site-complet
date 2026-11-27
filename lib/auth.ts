import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, db } from './firebase-admin';
import { info, warn, error } from './log';
import { checkEnv } from './env';
export class HttpError extends Error { constructor(public status: number, public code: string) { super(code); } }
// Un administrateur n'est PAS un marchand : son profil est dans `admins/{uid}`. Un ancien profil marchand d'admin est migre puis supprime.
async function loadAdmin(dec: any): Promise<Record<string, any> | null> {
  const ref = db.doc(`admins/${dec.uid}`); const s = await ref.get(); if (s.exists) return s.data()!;
  const setup = (await db.doc('system/setup').get()).data(); const legacy = await db.doc(`merchants/${dec.uid}`).get();
  if (!legacy.exists && setup?.uid !== dec.uid) return null;
  const l = legacy.data() ?? {}; const data = { email: dec.email, fullName: l.fullName ?? 'Administrateur', status: 'active', super: setup?.uid === dec.uid, twoFactor: false, createdAt: FieldValue.serverTimestamp() };
  await ref.set(data);
  if (legacy.exists) { const b = db.batch(); for (const c of ['merchants', 'merchant_settings', 'balances', 'api_activations']) b.delete(db.doc(`${c}/${dec.uid}`)); await b.commit(); }
  info('admin.profile_created', { uid: dec.uid, super: data.super, migrated: legacy.exists }); return data;
}
async function verify(req: Request, o: { mfa: boolean; verified: boolean }) {
  const t = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!t) throw new HttpError(401, 'unauthenticated');
  const dec = await adminAuth.verifyIdToken(t, true).catch((e: any) => { warn('auth.invalid_token', { reason: e?.code }); throw new HttpError(401, 'invalid_token'); });
  if (o.verified && !dec.email_verified) { warn('auth.email_not_verified', { uid: dec.uid }); throw new HttpError(403, 'email_not_verified'); }
  const role = (dec.role as string) ?? 'merchant';
  const prof: Record<string, any> | null = role === 'admin' ? await loadAdmin(dec) : (await db.doc(`merchants/${dec.uid}`).get()).data() ?? null;
  if (!prof || prof.status !== 'active') { warn('auth.account_unavailable', { uid: dec.uid, role }); throw new HttpError(403, 'account_disabled'); }
  let mfaOk = true;
  if (prof.twoFactor) mfaOk = (await db.doc(`mfa_sessions/${dec.uid}`).get()).data()?.authTime === dec.auth_time;
  if (o.mfa && !mfaOk) { warn('auth.mfa_required', { uid: dec.uid }); throw new HttpError(403, 'mfa_required'); }
  return { uid: dec.uid, role, provider: (dec.firebase as any)?.sign_in_provider as string | undefined, merchant: prof, authTime: dec.auth_time as number, emailVerified: !!dec.email_verified, mfaOk, email: dec.email as string };
}
export const requireUser = (req: Request) => verify(req, { mfa: true, verified: true });
export const requireUserBasic = (req: Request) => verify(req, { mfa: false, verified: false });
export async function requireAdmin(req: Request) {
  const u = await requireUser(req);
  if (u.role !== 'admin') { warn('auth.forbidden_admin', { uid: u.uid }); throw new HttpError(403, 'forbidden'); }
  if (!u.merchant.twoFactor) { warn('auth.admin_mfa_setup_required', { uid: u.uid }); throw new HttpError(403, 'mfa_setup_required'); }   // un administrateur doit protéger son accès par la double authentification
  return u;
}
// Seul l'administrateur principal (cree en premier) gere les autres administrateurs et ne peut lui-meme etre ni modifie ni supprime.
export async function requireSuper(req: Request) {
  const u = await requireAdmin(req);
  if (!u.merchant.super) { warn('auth.forbidden_super', { uid: u.uid }); throw new HttpError(403, 'forbidden'); }
  return u;
}
// Signale une erreur serveur à l'administrateur et au support (sans bloquer la réponse ; import dynamique pour éviter les cycles).
function notifyCritical(title: string, message?: string) {
  const p = import('./critical').then(m => m.reportCritical({ kind: 'server', title, message })).catch(() => {});
  try { import('next/server').then(m => (m as any).after?.(p)).catch(() => {}); } catch { /* hors requête */ }
}
export const fail = (e: unknown) => {
  if (e instanceof HttpError) { if (e.status >= 500) { error('http.error', { status: e.status, code: e.code }); notifyCritical('Erreur serveur ' + e.status, e.code); } else info('http.rejected', { status: e.status, code: e.code }); return Response.json({ error: e.code }, { status: e.status }); }
  checkEnv(); const err = e as Error; error('unhandled', { message: err?.message, stack: String(err?.stack ?? '').split('\n').slice(0, 4).join(' | ') });
  if (err?.name !== 'ZodError' && !(err instanceof SyntaxError)) notifyCritical('Erreur serveur inattendue', err?.message);   // entrée invalide = erreur de l'appelant, pas un incident
  return Response.json({ error: 'internal_error' }, { status: 500 });
};
