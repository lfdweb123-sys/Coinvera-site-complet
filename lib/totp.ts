import crypto from 'node:crypto';
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function b32enc(buf: Buffer) { let bits = '', out = ''; for (const b of buf) bits += b.toString(2).padStart(8, '0'); for (let i = 0; i < bits.length; i += 5) out += A[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; return out; }
export function b32dec(s: string) { let bits = ''; for (const c of s.replace(/=+$/, '').toUpperCase()) { const i = A.indexOf(c); if (i < 0) throw new Error('b32'); bits += i.toString(2).padStart(5, '0'); } const out: number[] = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); }
export const newSecret = () => b32enc(crypto.randomBytes(20));
export function totp(secret: string, atMs = Date.now(), digits = 6, step = 30) {
  const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(Math.floor(atMs / 1000 / step)));
  const h = crypto.createHmac('sha1', b32dec(secret)).update(c).digest(); const o = h[h.length - 1] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]; return String(n % 10 ** digits).padStart(digits, '0');
}
export function verifyTotp(secret: string, code: string, window = 1) {
  if (!/^\d{6}$/.test(code)) return false; let ok = false;
  for (let i = -window; i <= window; i++) { const a = Buffer.from(totp(secret, Date.now() + i * 30_000)), b = Buffer.from(code); if (a.length === b.length && crypto.timingSafeEqual(a, b)) ok = true; }
  return ok;
}
// Renvoie le pas de 30 s qui correspond au code (ou null) : permet de refuser un code déjà utilisé (anti-rejeu).
export function matchTotpStep(secret: string, code: string, window = 1): number | null {
  if (!/^\d{6}$/.test(code)) return null; let hit: number | null = null;
  for (let i = -window; i <= window; i++) { const at = Date.now() + i * 30_000, a = Buffer.from(totp(secret, at)), b = Buffer.from(code); if (a.length === b.length && crypto.timingSafeEqual(a, b)) hit = Math.floor(at / 30_000); }
  return hit;
}
export const otpauth = (secret: string, email: string) => `otpauth://totp/Coinvera:${encodeURIComponent(email)}?secret=${secret}&issuer=Coinvera&algorithm=SHA1&digits=6&period=30`;
