import { NextRequest, NextResponse } from 'next/server';
// Sous-domaines : docs.* -> /docs, status.* -> /status, helpcenter.* -> /helpcenter, api.* -> /api/... (chemins publics /v1/...)
// Pages du site principal : demandées depuis un sous-domaine (lien relatif, ancien favori…), elles sont redirigées vers le site principal, chemin et paramètres inclus.
const MAIN = ['/features', '/cartes', '/pricing', '/woocommerce', '/dons', '/contact', '/terms', '/privacy', '/refund-policy', '/login', '/register', '/forgot-password', '/verify-email', '/dashboard', '/admin', '/pay'];
const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.coinvera.me').replace(/\/$/, '');
export function middleware(req: NextRequest) {
  const h = (req.headers.get('host') ?? '').toLowerCase(), p = req.nextUrl.pathname, u = req.nextUrl.clone();
  if (/^(docs|status|helpcenter)\./.test(h) && MAIN.some(m => p === m || p.startsWith(m + '/'))) return NextResponse.redirect(SITE + p + req.nextUrl.search, 308);
  if (h.startsWith('docs.') && !p.startsWith('/docs')) { u.pathname = '/docs' + (p === '/' ? '' : p); return NextResponse.rewrite(u); }
  if (h.startsWith('status.') && !p.startsWith('/status') && !p.startsWith('/api')) { u.pathname = '/status'; return NextResponse.rewrite(u); }
  if (h.startsWith('helpcenter.') && !p.startsWith('/helpcenter')) { u.pathname = '/helpcenter'; return NextResponse.rewrite(u); }
  if (h.startsWith('api.') && !p.startsWith('/api')) { if (p === '/') return NextResponse.redirect(new URL('https://docs.coinvera.me')); u.pathname = '/api' + p; return NextResponse.rewrite(u); }
}
export const config = { matcher: ['/((?!_next|.*\\..*).*)'] };
