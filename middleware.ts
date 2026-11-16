import { NextRequest, NextResponse } from 'next/server';
// docs.coinvera.com -> /docs (meme projet Vercel, second domaine)
export function middleware(req: NextRequest) {
  if ((req.headers.get('host') ?? '').startsWith('docs.') && !req.nextUrl.pathname.startsWith('/docs')) {
    const u = req.nextUrl.clone(); u.pathname = '/docs' + (req.nextUrl.pathname === '/' ? '' : req.nextUrl.pathname); return NextResponse.rewrite(u);
  }
}
export const config = { matcher: ['/((?!_next|api|.*\\..*).*)'] };
