import { describe, it, expect, beforeEach } from 'vitest';
import { signAdmin, checkAdmin, adminGateEnabled, isAdminPath, ADMIN_TTL } from '../lib/admin-gate';
beforeEach(() => { process.env.ADMIN_GATE_SECRET = 'test-secret-0123456789'; delete process.env.ADMIN_GATE; });
describe('porte admin', () => {
  it('accepte un cookie signé valide', async () => { expect(await checkAdmin(await signAdmin('uid1'))).toBe(true); });
  it('refuse absent, falsifié, autre secret, expiré', async () => {
    const c = await signAdmin('uid1'); const [e, s, u] = c.split('.');
    expect(await checkAdmin(undefined)).toBe(false); expect(await checkAdmin('x.y.z')).toBe(false);
    expect(await checkAdmin(`${e}.${s}.uid2`)).toBe(false); expect(await checkAdmin(`${Number(e) + 99}.${s}.${u}`)).toBe(false);
    expect(await checkAdmin(c, Date.now() + (ADMIN_TTL + 5) * 1000)).toBe(false);
    process.env.ADMIN_GATE_SECRET = 'autre-secret-zzzzzzzzzzzz'; expect(await checkAdmin(c)).toBe(false);
  });
  it('est coupée sans secret ou avec ADMIN_GATE=off', () => {
    expect(adminGateEnabled()).toBe(true); process.env.ADMIN_GATE = 'off'; expect(adminGateEnabled()).toBe(false);
    delete process.env.ADMIN_GATE; delete process.env.ADMIN_GATE_SECRET; delete process.env.API_SECRET_ENC_KEY; expect(adminGateEnabled()).toBe(false);
  });
  it('ne vise que /admin', () => { expect(isAdminPath('/admin')).toBe(true); expect(isAdminPath('/admin/fiat')).toBe(true); expect(isAdminPath('/administration')).toBe(false); expect(isAdminPath('/dashboard')).toBe(false); });
});
