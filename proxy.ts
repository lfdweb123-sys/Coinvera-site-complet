import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, adminGateEnabled, checkAdmin, isAdminPath } from '@/lib/admin-gate';
import { HUMAN_COOKIE, checkHuman, gateEnabled, needsGate, safeNext } from '@/lib/human';
// Sous-domaines : docs.* -> /docs, status.* -> /status, helpcenter.* -> /helpcenter, api.* -> /api/... (chemins publics /v1/...)
// Pages du site principal : demandées depuis un sous-domaine (lien relatif, ancien favori…), elles sont redirigées vers le site principal, chemin et paramètres inclus.
const MAIN = ['/features', '/cartes', '/proxnum', '/esim', '/pricing', '/woocommerce', '/dons', '/contact', '/blog', '/terms', '/privacy', '/refund-policy', '/login', '/register', '/forgot-password', '/verify-email', '/dashboard', '/admin', '/pay'];
const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.coinvera.me').replace(/\/$/, '');
// Politique de sécurité du contenu (CSP) AVEC jeton aléatoire par requête : seuls les scripts portant ce jeton (ceux de Next.js et le script de thème) peuvent s'exécuter ;
// 'strict-dynamic' autorise ensuite les scripts qu'ils chargent eux-mêmes. Un script injecté par un attaquant (XSS) n'a pas le jeton et est bloqué par le navigateur.
const csp = (nonce: string) => [
  "default-src 'self'",
  `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https:${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,   // aucun 'unsafe-inline' ni 'unsafe-eval' en production ; https: n'est qu'un repli pour les vieux navigateurs (ignoré dès que 'strict-dynamic' est compris)
  "style-src 'self' https://fonts.googleapis.com",
  `style-src-elem 'self' 'nonce-${nonce}' https://fonts.googleapis.com`,
  "style-src-attr 'unsafe-inline'",   // attributs style="" du rendu serveur : un attribut ne peut pas porter de jeton ; ils ne peuvent exécuter aucun script",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https: wss:",
  "frame-src https:", "worker-src 'self'", "manifest-src 'self'",   // service worker et manifeste de l'application installable (PWA)
 
  "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'", "upgrade-insecure-requests",
].join('; ');
export async function proxy(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID()), policy = csp(nonce);
  const headers = new Headers(req.headers); headers.set('x-nonce', nonce); headers.set('Content-Security-Policy', policy);   // Next.js lit le jeton dans l'en-tête de la requête
  const done = (r: NextResponse) => { r.headers.set('Content-Security-Policy', policy); return r; };
  const h = (req.headers.get('host') ?? '').toLowerCase(), p = req.nextUrl.pathname, u = req.nextUrl.clone();
  // Optionnel : ADMIN_ALLOWED_IPS (adresses séparées par des virgules). Si défini, l'administration (pages et API) n'existe que pour ces adresses ; sinon réponse 404.
  const allow = (process.env.ADMIN_ALLOWED_IPS ?? '').split(',').map(x => x.trim()).filter(Boolean);
  if (allow.length && (p === '/admin' || p.startsWith('/admin/') || p.startsWith('/api/admin/'))) {
    const ip = (req.headers.get('x-vercel-forwarded-for') ?? req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
    if (!allow.includes(ip)) return done(new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } }));
  }
  // Interface d'administration invisible sans cookie administrateur signé : 404 (même réponse qu'une page inexistante). Le site principal seulement (pas les sous-domaines).
  if (adminGateEnabled() && isAdminPath(p) && !/^(docs|status|helpcenter|api)\./.test(h) && !(await checkAdmin(req.cookies.get(ADMIN_COOKIE)?.value))) return done(new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } }));
  // Vérification humain (Cloudflare Turnstile), une seule fois par visiteur : sans cookie valide, les pages sont remplacées par /verification, qui renvoie ensuite vers la page demandée.
  if (gateEnabled()) {
    const ok = await checkHuman(req.cookies.get(HUMAN_COOKIE)?.value);
    if (p === '/verification' && ok) return done(NextResponse.redirect(new URL(safeNext(req.nextUrl.searchParams.get('next')), req.url), 307));
    if (!ok && needsGate({ method: req.method, path: p, host: h, ua: req.headers.get('user-agent'), dest: req.headers.get('sec-fetch-dest'), accept: req.headers.get('accept'), rsc: req.headers.has('rsc') || req.headers.has('next-router-prefetch') })) {
      const g = req.nextUrl.clone(); g.pathname = '/verification'; g.search = '?next=' + encodeURIComponent(p + req.nextUrl.search);
      const r = NextResponse.redirect(g, 307); r.headers.set('Cache-Control', 'no-store'); return done(r);
    }
  }
  if (/^(docs|status|helpcenter)\./.test(h) && MAIN.some(m => p === m || p.startsWith(m + '/'))) return done(NextResponse.redirect(SITE + p + req.nextUrl.search, 308));
  if (h.startsWith('docs.') && !p.startsWith('/docs')) { u.pathname = '/docs' + (p === '/' ? '' : p); return done(NextResponse.rewrite(u, { request: { headers } })); }
  if (h.startsWith('status.') && !p.startsWith('/status') && !p.startsWith('/api')) { u.pathname = '/status'; return done(NextResponse.rewrite(u, { request: { headers } })); }
  if (h.startsWith('helpcenter.') && !p.startsWith('/helpcenter')) { u.pathname = '/helpcenter'; return done(NextResponse.rewrite(u, { request: { headers } })); }
  if (h.startsWith('api.') && !p.startsWith('/api')) { if (p === '/') return done(NextResponse.redirect(new URL('https://docs.coinvera.me'))); u.pathname = '/api' + p; return done(NextResponse.rewrite(u, { request: { headers } })); }
  return done(NextResponse.next({ request: { headers } }));
}
export const config = { matcher: ['/((?!_next|.*\\..*).*)'] };
