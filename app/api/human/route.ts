import { HUMAN_COOKIE, HUMAN_TTL, gateEnabled, signHuman } from '@/lib/human';
// Valide le jeton Cloudflare Turnstile côté serveur, puis pose le cookie signé qui dispense de nouveau défi.
export async function POST(req: Request) {
  if (!gateEnabled()) return Response.json({ ok: true });
  let token = ''; try { const b = await req.json(); token = typeof b?.token === 'string' ? b.token : ''; } catch { /* corps invalide */ }
  if (!token || token.length > 2048) return Response.json({ error: 'human_failed' }, { status: 400 });
  const form = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY!, response: token }); const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim(); if (ip) form.set('remoteip', ip);
  let ok = false;
  try { const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form, signal: AbortSignal.timeout(8000), cache: 'no-store' }); ok = !!(await r.json()).success; }
  catch { return Response.json({ error: 'human_unavailable' }, { status: 503 }); }
  if (!ok) return Response.json({ error: 'human_failed' }, { status: 400 });
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Set-Cookie': `${HUMAN_COOKIE}=${await signHuman()}; Path=/; Max-Age=${HUMAN_TTL}; HttpOnly; SameSite=Lax${secure}` } });
}
