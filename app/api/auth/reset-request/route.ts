import { z } from 'zod';
import { adminAuth, db } from '@/lib/firebase-admin';
import { fail, HttpError } from '@/lib/auth';
import { issueCode } from '@/lib/codes';
import { ipOf, rateLimit } from '@/lib/ratelimit';
import { requireHuman } from '@/lib/human';
import { info } from '@/lib/log';
// Reponse identique que le compte existe ou non (pas d'enumeration de comptes).
export async function POST(req: Request) {
  try { requireHuman(req); await rateLimit('rr_' + ipOf(req), 10, 3600); const { email } = z.object({ email: z.string().email() }).parse(await req.json());
    try { const u = await adminAuth.getUserByEmail(email); const m = (await db.doc(`merchants/${u.uid}`).get()).data(); if (m) await issueCode(u.uid, 'reset', email, m.fullName); else info('reset.no_merchant', {}); }
    catch (e) { if (e instanceof HttpError && e.status === 429) { /* silencieux */ } else info('reset.no_account_or_error', { reason: (e as any)?.code ?? (e as Error).message }); }
    return Response.json({ ok: true });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
