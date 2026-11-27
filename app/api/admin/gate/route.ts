import { fail, HttpError, requireUserBasic } from '@/lib/auth';
import { ipOf, rateLimit } from '@/lib/ratelimit';
import { ADMIN_COOKIE, ADMIN_TTL, adminGateEnabled, signAdmin } from '@/lib/admin-gate';
// Délivre le cookie qui rend l'interface /admin visible : réservé à un administrateur connecté (jeton Firebase vérifié, rôle admin, profil actif).
export async function POST(req: Request) {
  try {
    await rateLimit('admgate_' + ipOf(req), 20, 3600);
    const u = await requireUserBasic(req); if (u.role !== 'admin') throw new HttpError(403, 'forbidden');
    const h = new Headers({ 'Content-Type': 'application/json' });
    if (adminGateEnabled()) h.append('Set-Cookie', `${ADMIN_COOKIE}=${await signAdmin(u.uid)}; Max-Age=${ADMIN_TTL}; Path=/; HttpOnly; Secure; SameSite=Strict`);
    return new Response(JSON.stringify({ ok: true }), { headers: h });
  } catch (e) { return fail(e); }
}
