import { NextRequest, NextResponse } from 'next/server';
// Sous-domaines : docs.* -> /docs, status.* -> /status, api.* -> /api/... (chemins publics /v1/...)
export function middleware(req: NextRequest) {
  const h = (req.headers.get('host') ?? '').toLowerCase(), p = req.nextUrl.pathname, u = req.nextUrl.clone();
  if (h.startsWith('docs.') && !p.startsWith('/docs')) { u.pathname = '/docs' + (p === '/' ? '' : p); return NextResponse.rewrite(u); }
  if (h.startsWith('status.') && !p.startsWith('/status') && !p.startsWith('/api')) { u.pathname = '/status'; return NextResponse.rewrite(u); }
  if (h.startsWith('api.') && !p.startsWith('/api')) { if (p === '/') return NextResponse.redirect(new URL('https://docs.coinvera.me')); u.pathname = '/api' + p; return NextResponse.rewrite(u); }
}
export const config = { matcher: ['/((?!_next|.*\\..*).*)'] };
