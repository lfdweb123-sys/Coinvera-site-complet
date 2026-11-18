import crypto from 'node:crypto';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, db } from '@/lib/firebase-admin';
import { fail, HttpError } from '@/lib/auth';
import { ipOf, rateLimit } from '@/lib/ratelimit';
import { info } from '@/lib/log';
const Body = z.object({ fullName: z.string().min(2).max(80), company: z.string().max(120).optional().default('') });
// Cree le profil marchand (idempotent). Role toujours 'merchant' : l'admin n'est attribuable que par script serveur.
export async function POST(req: Request) {
  try {
    await rateLimit('init_' + ipOf(req), 20, 3600);
    const t = req.headers.get('authorization')?.replace(/^Bearer /, ''); if (!t) throw new HttpError(401, 'unauthenticated');
    const dec = await adminAuth.verifyIdToken(t).catch(() => { throw new HttpError(401, 'invalid_token'); });
    const b = Body.parse(await req.json());
    const ref = db.doc(`merchants/${dec.uid}`);
    if ((await ref.get()).exists) return Response.json({ ok: true });
    const now = FieldValue.serverTimestamp(); const batch = db.batch();
    batch.set(ref, { email: dec.email, fullName: b.fullName, company: b.company, merchantCode: 'M-' + crypto.randomBytes(5).toString('hex').toUpperCase(), status: 'active', createdAt: now, updatedAt: now });
    batch.set(db.doc(`merchant_settings/${dec.uid}`), { webhookUrl: null, webhookSecret: 'whsec_' + crypto.randomBytes(24).toString('hex'), createdAt: now });
    batch.set(db.doc(`api_activations/${dec.uid}`), { activated: false, trialsUsed: 0, createdAt: now });
    batch.set(db.doc(`balances/${dec.uid}`), { available: 0, reserved: 0, totalReceived: 0, totalWithdrawn: 0, feesPaid: 0, updatedAt: now });
    await batch.commit(); info('auth.merchant_created', { uid: dec.uid, email: dec.email });
    return Response.json({ ok: true }, { status: 201 });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
