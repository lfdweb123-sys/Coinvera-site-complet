import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { fail, HttpError, requireUser } from '@/lib/auth';
import { dec } from '@/lib/apikey';
import { verifyTotp } from '@/lib/totp';
import { rateLimit } from '@/lib/ratelimit';
import { info, warn } from '@/lib/log';
export async function POST(req: Request) {
  try { const u = await requireUser(req); await rateLimit('2fa_' + u.uid, 10, 600); const { code } = z.object({ code: z.string().regex(/^\d{6}$/) }).parse(await req.json());
    const s = (await db.doc(`merchant_settings/${u.uid}`).get()).data(); if (!s?.totpSecret) throw new HttpError(400, 'not_enabled');
    if (!verifyTotp(dec(s.totpSecret), code)) { warn('2fa.disable_invalid_code', { uid: u.uid }); throw new HttpError(400, 'code_invalid'); }
    await db.doc(`merchant_settings/${u.uid}`).update({ totpSecret: FieldValue.delete() }); await db.doc(`merchants/${u.uid}`).update({ twoFactor: false }); info('2fa.disabled', { uid: u.uid });
    return Response.json({ ok: true });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'code_invalid' }, { status: 400 }) : fail(e); }
}
