import { describe, it, expect, vi, afterEach } from 'vitest';
import { badIp, assertPublicHost } from '@/lib/ssrf';
import { safeUrl } from '@/lib/webhook-urls';
import { cronAllowed } from '@/lib/cron';
import { matchTotpStep, totp, newSecret } from '@/lib/totp';
const req = (a?: string) => new Request('https://x.test/cron', { headers: a ? { authorization: a } : {} });
afterEach(() => { vi.unstubAllEnvs(); });
describe('anti-SSRF', () => {
  it('refuse les adresses privées, loopback, link-local, CGNAT et IPv6 locales', () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.1.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '224.0.0.1']) expect(badIp(ip), ip).toBe(true);
    for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) expect(badIp(ip), ip).toBe(false);
  });
  it('refuse les URL dangereuses avant toute résolution DNS', async () => {
    for (const u of ['https://localhost./', 'https://metadata.google.internal./', 'https://a.local./', 'https://user:pw@example.com/', 'https://example.com:6379/', 'http://example.com/', 'https://127.0.0.1/']) await expect(assertPublicHost(u), u).rejects.toThrow();
  });
  it('safeUrl normalise le point final et refuse ports/identifiants', () => {
    for (const u of ['https://localhost./', 'https://a.local./', 'https://x.com:8443/', 'https://u:p@x.com/', 'https://10.0.0.1/', 'https://nodot/']) expect(() => safeUrl(u), u).toThrow();
    expect(safeUrl('https://shop.example.com/hook')).toBe('https://shop.example.com/hook');
  });
});
describe('cron', () => {
  it('refuse tout si CRON_SECRET est absent, y compris « Bearer undefined »', () => { vi.stubEnv('CRON_SECRET', ''); expect(cronAllowed(req('Bearer undefined'))).toBe(false); expect(cronAllowed(req('Bearer '))).toBe(false); });
  it('accepte uniquement le bon secret', () => { vi.stubEnv('CRON_SECRET', 'a'.repeat(32)); expect(cronAllowed(req('Bearer ' + 'a'.repeat(32)))).toBe(true); expect(cronAllowed(req('Bearer ' + 'b'.repeat(32)))).toBe(false); expect(cronAllowed(req())).toBe(false); });
});
describe('TOTP anti-rejeu', () => {
  it('renvoie le pas du code, utilisable pour refuser un second usage', () => { const s = newSecret(); const c = totp(s); const step = matchTotpStep(s, c); expect(step).toBe(Math.floor(Date.now() / 30_000)); expect(matchTotpStep(s, '000000' === c ? '111111' : '000000')).toBeNull(); });
});
