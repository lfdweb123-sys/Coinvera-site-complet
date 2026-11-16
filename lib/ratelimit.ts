import { db } from './firebase-admin';
import { HttpError } from './auth';
export const ipOf = (req: Request) => (req.headers.get('x-forwarded-for') ?? 'x').split(',')[0].trim();
export async function rateLimit(key: string, limit: number, windowSec: number) {
  const win = Math.floor(Date.now() / (windowSec * 1000));
  const ref = db.doc(`idempotency_records/rl_${key.replace(/[^a-zA-Z0-9]/g, '_')}_${win}`);
  await db.runTransaction(async tx => {
    const n = ((await tx.get(ref)).data()?.n ?? 0) + 1;
    if (n > limit) throw new HttpError(429, 'rate_limited');
    tx.set(ref, { n, expiresAt: Date.now() + windowSec * 2000 });
  });
}
