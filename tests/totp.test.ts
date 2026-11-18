import { describe, expect, it } from 'vitest';
import { b32dec, b32enc, totp } from '@/lib/totp';
describe('TOTP (RFC 6238)', () => {
  const secret = b32enc(Buffer.from('12345678901234567890'));
  it('encode/decode base32', () => { expect(b32dec(secret).toString()).toBe('12345678901234567890'); });
  it('vecteurs RFC 6238 (SHA-1)', () => { expect(totp(secret, 59_000, 8)).toBe('94287082'); expect(totp(secret, 1111111109_000, 8)).toBe('07081804'); expect(totp(secret, 59_000)).toBe('287082'); });
});
