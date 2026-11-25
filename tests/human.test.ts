import { beforeAll, describe, expect, it } from 'vitest';
import { HUMAN_TTL, checkHuman, needsGate, safeNext, signHuman } from '@/lib/human';
beforeAll(() => { process.env.HUMAN_SECRET = 'secret-de-test'; });
const base = { method: 'GET', path: '/pricing', host: 'www.coinvera.me', ua: 'Mozilla/5.0', dest: 'document' };
describe('cookie humain', () => {
  it('accepte un cookie valide, refuse falsifié ou expiré', async () => {
    const v = await signHuman(); expect(await checkHuman(v)).toBe(true);
    expect(await checkHuman(v.replace(/.$/, c => (c === 'a' ? 'b' : 'a')))).toBe(false);
    expect(await checkHuman('9999999999.abc')).toBe(false); expect(await checkHuman(undefined)).toBe(false);
    expect(await checkHuman(await signHuman(Date.now() - (HUMAN_TTL + 10) * 1000))).toBe(false);
  });
});
describe('safeNext', () => {
  it('ne garde que les chemins internes', () => {
    expect(safeNext('/pricing?x=1')).toBe('/pricing?x=1'); expect(safeNext('//evil.com')).toBe('/'); expect(safeNext('https://evil.com')).toBe('/'); expect(safeNext('/\\evil.com')).toBe('/');
    expect(safeNext('/verification?next=/')).toBe('/'); expect(safeNext('/api/x')).toBe('/'); expect(safeNext(null)).toBe('/');
  });
});
describe('needsGate', () => {
  it('protège les pages vues dans un navigateur', () => { expect(needsGate(base)).toBe(true); expect(needsGate({ ...base, dest: undefined, accept: 'text/html,*/*' })).toBe(true); });
  it('laisse passer API, sous-domaines techniques, vérification, requêtes internes et non-pages', () => {
    expect(needsGate({ ...base, path: '/api/v1/payments' })).toBe(false); expect(needsGate({ ...base, host: 'docs.coinvera.me' })).toBe(false); expect(needsGate({ ...base, host: 'api.coinvera.me' })).toBe(false);
    expect(needsGate({ ...base, path: '/verification' })).toBe(false); expect(needsGate({ ...base, rsc: true })).toBe(false); expect(needsGate({ ...base, method: 'POST' })).toBe(false); expect(needsGate({ ...base, dest: 'image' })).toBe(false);
  });
  it('laisse passer les moteurs de recherche et les aperçus de partage', () => {
    expect(needsGate({ ...base, ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' })).toBe(false); expect(needsGate({ ...base, ua: 'facebookexternalhit/1.1' })).toBe(false); expect(needsGate({ ...base, ua: 'WhatsApp/2.23' })).toBe(false);
  });
});
