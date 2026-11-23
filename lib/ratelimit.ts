import { Timestamp } from 'firebase-admin/firestore';
import { db } from './firebase-admin';
import { HttpError } from './auth';
import { warn } from './log';
export const ipOf = (req: Request) => (req.headers.get('x-forwarded-for') ?? 'x').split(',')[0].trim();
export async function rateLimit(key: string, limit: number, windowSec: number) {
  const win = Math.floor(Date.now() / (windowSec * 1000));
  const ref = db.doc(`idempotency_records/rl_${key.replace(/[^a-zA-Z0-9]/g, '_')}_${win}`);
  await db.runTransaction(async tx => {
    const n = ((await tx.get(ref)).data()?.n ?? 0) + 1;
    if (n > limit) { warn('rate_limited', { key: key.slice(0, 24), limit, windowSec }); throw new HttpError(429, 'rate_limited'); }
    tx.set(ref, { n, expiresAt: Date.now() + windowSec * 2000, ttl: Timestamp.fromMillis(Date.now() + windowSec * 2000) });
  });
}
