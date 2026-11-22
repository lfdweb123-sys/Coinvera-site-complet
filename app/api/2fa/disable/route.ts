import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { twofaRefs } from '@/lib/twofa';
import { fail, HttpError, requireUser } from '@/lib/auth';
import { dec } from '@/lib/apikey';
import { verifyTotp } from '@/lib/totp';
import { rateLimit } from '@/lib/ratelimit';
import { info, warn } from '@/lib/log';
export async function POST(req: Request) {
  try { const u = await requireUser(req); const R = twofaRefs(u); await rateLimit('2fa_' + u.uid, 10, 600); const { code } = z.object({ code: z.string().regex(/^\d{6}$/) }).parse(await req.json());
    const s = (await R.secret.get()).data(); if (!s?.totpSecret) throw new HttpError(400, 'not_enabled');
    if (!verifyTotp(dec(s.totpSecret), code)) { warn('2fa.disable_invalid_code', { uid: u.uid }); throw new HttpError(400, 'code_invalid'); }
    await R.secret.update({ totpSecret: FieldValue.delete() }); await R.prof.update({ twoFactor: false }); info('2fa.disabled', { uid: u.uid });
    return Response.json({ ok: true });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'code_invalid' }, { status: 400 }) : fail(e); }
}
