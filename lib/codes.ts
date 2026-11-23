import crypto from 'node:crypto';
import { db } from './firebase-admin';
import { HttpError } from './auth';
import { sendMail } from './brevo';
import { codeEmail } from './mail';
import { info, warn, error } from './log';
type Purpose = 'verify' | 'reset';
const K = () => { const k = process.env.CAPTCHA_SECRET ?? process.env.API_SECRET_ENC_KEY; if (!k && process.env.NODE_ENV === 'production') throw new HttpError(500, 'server_misconfigured'); return k ?? 'dev'; };
const H = (uid: string, p: Purpose, c: string) => crypto.createHmac('sha256', K()).update(`${p}.${uid}.${c}`).digest('hex');
// Genere un code a 6 chiffres (valable 10 min, 5 essais, renvoi toutes les 60 s, 5 envois / heure) et l'envoie par e-mail.
export async function issueCode(uid: string, purpose: Purpose, email: string, name: string) {
  const ref = db.doc(`otp_codes/${purpose}_${uid}`); const d = (await ref.get()).data(); const now = Date.now();
  if (d && now - d.sentAt < 60_000) { info('otp.too_soon', { uid, purpose }); throw new HttpError(429, 'too_soon'); }
  const fresh = !d || now - d.windowStart > 3_600_000; const count = fresh ? 1 : d!.count + 1;
  if (!fresh && count > 5) { warn('otp.hourly_limit', { uid, purpose }); throw new HttpError(429, 'rate_limited'); }
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await ref.set({ hash: H(uid, purpose, code), expiresAt: now + 10 * 60_000, attempts: 0, sentAt: now, windowStart: fresh ? now : d!.windowStart, count });
  const m = codeEmail({ name, code, purpose });
  try { await sendMail(email, m.subject, m.html); info('otp.sent', { uid, purpose, email }); }
  catch (e) { error('otp.mail_failed', { uid, purpose, message: (e as Error).message }); await ref.delete().catch(() => {}); throw new HttpError(502, 'mail_failed'); }
}
export async function checkCode(uid: string, purpose: Purpose, code: string) {
  const ref = db.doc(`otp_codes/${purpose}_${uid}`);
  // L'essai est compté AVANT la comparaison, dans une transaction : des requêtes parallèles ne peuvent pas dépasser les 5 essais.
  const d = await db.runTransaction(async tx => { const x = (await tx.get(ref)).data(); if (!x || Date.now() > x.expiresAt) return { expired: true } as const; if (x.attempts >= 5) return { blocked: true } as const; tx.update(ref, { attempts: x.attempts + 1 }); return { hash: x.hash as string, attempts: x.attempts + 1 as number }; });
  if ('expired' in d) { info('otp.expired', { uid, purpose }); throw new HttpError(400, 'code_expired'); }
  if ('blocked' in d) { warn('otp.too_many_attempts', { uid, purpose }); throw new HttpError(429, 'too_many_attempts'); }
  const a = Buffer.from(H(uid, purpose, String(code).trim())), b = Buffer.from(d.hash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) { warn('otp.invalid', { uid, purpose, attempts: d.attempts }); throw new HttpError(400, 'code_invalid'); }
  await ref.delete(); info('otp.verified', { uid, purpose });
}
