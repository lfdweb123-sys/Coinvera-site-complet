import { describe, it, expect } from 'vitest';
import { resolvePublic, pinnedLookup, badIp } from '../lib/ssrf';
describe('anti-SSRF', () => {
  it('refuse les hôtes non publics, les ports et identifiants', async () => {
    for (const u of ['https://127.0.0.1/x', 'https://localhost/x', 'http://example.com/x', 'https://example.com:8443/x', 'https://user:pw@example.com/x', 'https://10.0.0.1/x', 'https://intranet.internal/x']) await expect(resolvePublic(u)).rejects.toThrow('unsafe_host');
  });
  it('classe les adresses privées', () => { for (const ip of ['10.1.1.1', '127.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.1.1', '100.64.0.1', '::1', 'fd00::1', '::ffff:10.0.0.1']) expect(badIp(ip)).toBe(true); expect(badIp('8.8.8.8')).toBe(false); });
  it('le résolveur épinglé renvoie toujours l’adresse validée', () => {
    const l = pinnedLookup('93.184.216.34', 4); let r: any; l('evil.example', {}, (...a: any[]) => (r = a)); expect(r).toEqual([null, '93.184.216.34', 4]);
    l('evil.example', { all: true }, (...a: any[]) => (r = a)); expect(r).toEqual([null, [{ address: '93.184.216.34', family: 4 }]]);
  });
});
