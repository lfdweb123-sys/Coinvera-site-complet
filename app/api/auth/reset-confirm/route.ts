import { z } from 'zod';
import { adminAuth } from '@/lib/firebase-admin';
import { fail, HttpError } from '@/lib/auth';
import { checkCode } from '@/lib/codes';
import { ipOf, rateLimit } from '@/lib/ratelimit';
import { info } from '@/lib/log';
export async function POST(req: Request) {
  try { await rateLimit('rc_' + ipOf(req), 15, 3600); const b = z.object({ email: z.string().email(), code: z.string().regex(/^\d{6}$/), password: z.string().min(8).max(128) }).parse(await req.json());
    const u = await adminAuth.getUserByEmail(b.email).catch(() => { throw new HttpError(400, 'code_invalid'); });
    await checkCode(u.uid, 'reset', b.code); await adminAuth.updateUser(u.uid, { password: b.password }); await adminAuth.revokeRefreshTokens(u.uid);
    info('auth.password_reset', { uid: u.uid }); return Response.json({ ok: true });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
