import { z } from 'zod';
import { adminAuth, db } from '@/lib/firebase-admin';
import { fail, requireUserBasic } from '@/lib/auth';
import { checkCode } from '@/lib/codes';
import { rateLimit } from '@/lib/ratelimit';
import { info } from '@/lib/log';
export async function POST(req: Request) {
  try { const u = await requireUserBasic(req); await rateLimit('vc_' + u.uid, 20, 600); const { code } = z.object({ code: z.string().regex(/^\d{6}$/) }).parse(await req.json());
    await checkCode(u.uid, 'verify', code); await adminAuth.updateUser(u.uid, { emailVerified: true }); await db.doc(`merchants/${u.uid}`).update({ emailVerified: true, updatedAt: new Date() });
    info('auth.email_verified', { uid: u.uid }); return Response.json({ ok: true });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'code_invalid' }, { status: 400 }) : fail(e); }
}
