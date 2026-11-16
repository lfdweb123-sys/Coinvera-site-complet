import { describe, expect, it } from 'vitest';
import { signPayload } from '@/lib/sign';
describe('signature API', () => {
  it('est deterministe', () => { expect(signPayload('s', '1', 'n', 'POST', '/api/v1/payments', '{}')).toBe(signPayload('s', '1', 'n', 'POST', '/api/v1/payments', '{}')); });
  it('change si le corps, le chemin, le nonce ou le secret changent', () => {
    const b = signPayload('s', '1', 'n', 'POST', '/p', '{}');
    expect(signPayload('s', '1', 'n', 'POST', '/p', '{"a":1}')).not.toBe(b); expect(signPayload('s', '1', 'n', 'POST', '/q', '{}')).not.toBe(b);
    expect(signPayload('s', '1', 'm', 'POST', '/p', '{}')).not.toBe(b); expect(signPayload('t', '1', 'n', 'POST', '/p', '{}')).not.toBe(b); });
});
