import { z } from 'zod';
import { db } from '@/lib/firebase-admin';
import { twofaRefs } from '@/lib/twofa';
import { fail, HttpError, requireUserBasic } from '@/lib/auth';
import { dec } from '@/lib/apikey';
import { matchTotpStep } from '@/lib/totp';
import { rateLimit } from '@/lib/ratelimit';
import { info, warn } from '@/lib/log';
// Valide le code a chaque nouvelle connexion : la verification est liee a l'heure d'authentification du jeton (auth_time).
export async function POST(req: Request) {
  try { const u = await requireUserBasic(req); const R = twofaRefs(u); await rateLimit('2fav_' + u.uid, 8, 600); const { code } = z.object({ code: z.string().regex(/^\d{6}$/) }).parse(await req.json());
    const s = (await R.secret.get()).data(); if (!s?.totpSecret) return Response.json({ ok: true });
    const step = matchTotpStep(dec(s.totpSecret), code);
    if (step == null || step <= (s.lastStep ?? 0)) { warn('2fa.login_invalid_code', { uid: u.uid, replay: step != null }); throw new HttpError(400, 'code_invalid'); }   // un code déjà utilisé ne sert pas deux fois
    await R.secret.update({ lastStep: step });
    await db.doc(`mfa_sessions/${u.uid}`).set({ authTime: u.authTime }); info('2fa.login_ok', { uid: u.uid }); return Response.json({ ok: true });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'code_invalid' }, { status: 400 }) : fail(e); }
}
