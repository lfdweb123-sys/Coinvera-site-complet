import crypto from 'node:crypto';
import { db } from './firebase-admin';
import { HttpError } from './auth';
const K = () => process.env.CAPTCHA_SECRET ?? process.env.API_SECRET_ENC_KEY ?? 'dev';
const sig = (n: string, e: number, ans: number) => crypto.createHmac('sha256', K()).update(`${n}.${e}.${ans}`).digest('hex');
export function makeCaptcha() {
  const a = 2 + crypto.randomInt(8), b = 2 + crypto.randomInt(8), op = ['+', '−', '×'][crypto.randomInt(3)];
  const x = op === '−' ? Math.max(a, b) : a, y = op === '−' ? Math.min(a, b) : b; const ans = op === '+' ? x + y : op === '−' ? x - y : x * y;
  const n = crypto.randomBytes(8).toString('hex'), e = Date.now() + 10 * 60_000;
  return { question: `${x} ${op} ${y}`, token: `${n}.${e}.${sig(n, e, ans)}` };   // la reponse n'est jamais dans le jeton
}
export async function checkCaptcha(token: string, answer: string) {
  const [n, e, s] = (token ?? '').split('.'); const ans = Number(answer);
  if (!n || !e || !s || !Number.isInteger(ans) || Date.now() > Number(e)) throw new HttpError(400, 'captcha_invalid');
  const a = Buffer.from(sig(n, Number(e), ans)), b = Buffer.from(s);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpError(400, 'captcha_invalid');
  await db.doc(`idempotency_records/cap_${n}`).create({ expiresAt: Number(e) }).catch(() => { throw new HttpError(400, 'captcha_invalid'); });   // usage unique
}
