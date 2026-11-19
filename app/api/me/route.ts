import { fail, requireUserBasic } from '@/lib/auth';
export async function GET(req: Request) {
  try { const u = await requireUserBasic(req); return Response.json({ emailVerified: u.emailVerified, twoFactor: !!u.merchant.twoFactor, mfa: u.mfaOk, admin: u.role === 'admin', superAdmin: !!u.merchant.super }); } catch (e) { return fail(e); }
}
