import { db } from '@/lib/firebase-admin';
import { fail, HttpError, requireUser } from '@/lib/auth';
import { enc } from '@/lib/apikey';
import { newSecret, otpauth } from '@/lib/totp';
import { info } from '@/lib/log';
export async function POST(req: Request) {
  try { const u = await requireUser(req); if (u.merchant.twoFactor) throw new HttpError(400, 'already_enabled');
    const secret = newSecret(); await db.doc(`merchant_settings/${u.uid}`).set({ totpPending: enc(secret) }, { merge: true }); info('2fa.setup_started', { uid: u.uid });
    return Response.json({ secret, uri: otpauth(secret, u.email) });
  } catch (e) { return fail(e); }
}
