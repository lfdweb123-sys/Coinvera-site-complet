// Journal structure (JSON, une ligne par evenement) : visible dans Vercel > Logs. Les secrets sont masques automatiquement.
type Level = 'info' | 'warn' | 'error';
const SECRET = /secret|password|authorization|token|api[-_]?key|signature|otp|private|cookie/i;
const ADDR = /address/i;
const mask = (s: string) => (s.length > 12 ? s.slice(0, 5) + '…' + s.slice(-4) : s);
function scrub(v: any, depth = 0): any {
  if (v == null || depth > 3) return v;
  if (Array.isArray(v)) return v.slice(0, 20).map(x => scrub(x, depth + 1));
  if (typeof v === 'object') { const o: any = {}; for (const [k, x] of Object.entries(v)) o[k] = SECRET.test(k) ? '[masque]' : ADDR.test(k) && typeof x === 'string' ? mask(x) : scrub(x, depth + 1); return o; }
  if (typeof v === 'string' && v.length > 400) return v.slice(0, 400) + '…';
  return v;
}
export function log(level: Level, event: string, data: Record<string, any> = {}) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...scrub(data) });
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
}
export const info = (e: string, d?: Record<string, any>) => log('info', e, d);
export const warn = (e: string, d?: Record<string, any>) => log('warn', e, d);
export const error = (e: string, d?: Record<string, any>) => log('error', e, d);
