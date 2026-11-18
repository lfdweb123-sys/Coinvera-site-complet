import { fail, requireUserBasic } from '@/lib/auth';
import { issueCode } from '@/lib/codes';
export async function POST(req: Request) {
  try { const u = await requireUserBasic(req); if (u.emailVerified) return Response.json({ already: true });
    await issueCode(u.uid, 'verify', u.email, u.merchant.fullName); return Response.json({ ok: true });
  } catch (e) { return fail(e); }
}
