import { z } from 'zod';
import { fail, HttpError } from '@/lib/auth';
import { humanCookies, humanEnabled, verifyTurnstile } from '@/lib/human';
import { ipOf, rateLimit } from '@/lib/ratelimit';
// Reçoit le jeton Turnstile du navigateur, le fait contrôler par Cloudflare et pose le cookie de vérification (12 h).
export async function POST(req: Request) {
  try {
    if (!humanEnabled()) return Response.json({ ok: true, disabled: true });   // Turnstile non configuré : rien à vérifier
    const ip = ipOf(req); await rateLimit('human_' + ip, 30, 3600);
    const { token } = z.object({ token: z.string().min(10).max(2048) }).parse(await req.json());
    if (!(await verifyTurnstile(token, ip))) throw new HttpError(400, 'human_failed');
    const h = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    for (const c of humanCookies(process.env.NODE_ENV === 'production')) h.append('Set-Cookie', c);
    return new Response(JSON.stringify({ ok: true }), { headers: h });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
