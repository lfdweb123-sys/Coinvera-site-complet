// En-têtes de sécurité. La politique de sécurité du contenu (CSP, avec jeton par requête) est posée par proxy.ts.
const headers = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },   // popups de connexion (Google) conservés
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
];
export default { poweredByHeader: false, async headers() { return [{ source: '/(.*)', headers }, { source: '/api/(.*)', headers: [{ key: 'Cache-Control', value: 'no-store' }] }]; } };
