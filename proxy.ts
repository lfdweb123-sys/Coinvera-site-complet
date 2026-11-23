import { NextRequest, NextResponse } from 'next/server';
// Sous-domaines : docs.* -> /docs, status.* -> /status, helpcenter.* -> /helpcenter, api.* -> /api/... (chemins publics /v1/...)
// Pages du site principal : demandées depuis un sous-domaine (lien relatif, ancien favori…), elles sont redirigées vers le site principal, chemin et paramètres inclus.
const MAIN = ['/features', '/cartes', '/pricing', '/woocommerce', '/dons', '/contact', '/terms', '/privacy', '/refund-policy', '/login', '/register', '/forgot-password', '/verify-email', '/dashboard', '/admin', '/pay'];
const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.coinvera.me').replace(/\/$/, '');
// Politique de sécurité du contenu (CSP) AVEC jeton aléatoire par requête : seuls les scripts portant ce jeton (ceux de Next.js et le script de thème) peuvent s'exécuter ;
// 'strict-dynamic' autorise ensuite les scripts qu'ils chargent eux-mêmes. Un script injecté par un attaquant (XSS) n'a pas le jeton et est bloqué par le navigateur.
const csp = (nonce: string) => [
  "default-src 'self'",
  `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,   // https: et 'unsafe-inline' ne servent qu'aux vieux navigateurs : ignorés dès qu'un jeton est présent
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https: wss:",
  "frame-src https:",
  "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'", "upgrade-insecure-requests",
].join('; ');
export function proxy(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID()), policy = csp(nonce);
  const headers = new Headers(req.headers); headers.set('x-nonce', nonce); headers.set('Content-Security-Policy', policy);   // Next.js lit le jeton dans l'en-tête de la requête
  const done = (r: NextResponse) => { r.headers.set('Content-Security-Policy', policy); return r; };
  const h = (req.headers.get('host') ?? '').toLowerCase(), p = req.nextUrl.pathname, u = req.nextUrl.clone();
  if (/^(docs|status|helpcenter)\./.test(h) && MAIN.some(m => p === m || p.startsWith(m + '/'))) return done(NextResponse.redirect(SITE + p + req.nextUrl.search, 308));
  if (h.startsWith('docs.') && !p.startsWith('/docs')) { u.pathname = '/docs' + (p === '/' ? '' : p); return done(NextResponse.rewrite(u, { request: { headers } })); }
  if (h.startsWith('status.') && !p.startsWith('/status') && !p.startsWith('/api')) { u.pathname = '/status'; return done(NextResponse.rewrite(u, { request: { headers } })); }
  if (h.startsWith('helpcenter.') && !p.startsWith('/helpcenter')) { u.pathname = '/helpcenter'; return done(NextResponse.rewrite(u, { request: { headers } })); }
  if (h.startsWith('api.') && !p.startsWith('/api')) { if (p === '/') return done(NextResponse.redirect(new URL('https://docs.coinvera.me'))); u.pathname = '/api' + p; return done(NextResponse.rewrite(u, { request: { headers } })); }
  return done(NextResponse.next({ request: { headers } }));
}
export const config = { matcher: ['/((?!_next|.*\\..*).*)'] };
