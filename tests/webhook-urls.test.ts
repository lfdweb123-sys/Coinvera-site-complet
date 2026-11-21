import { describe, expect, it } from 'vitest';
import { MAX_WEBHOOKS, addUrl, normalizeUrls, safeUrl, webhookUrlsOf } from '@/lib/webhook-urls';
describe('liste des URL de webhook', () => {
  it('lit l’ancien champ unique et la nouvelle liste', () => {
    expect(webhookUrlsOf({ webhookUrl: 'https://a.test/h' })).toEqual(['https://a.test/h']);
    expect(webhookUrlsOf({ webhookUrls: ['https://a.test/h', 'https://b.test/h'], webhookUrl: 'https://a.test/h' })).toEqual(['https://a.test/h', 'https://b.test/h']);
    expect(webhookUrlsOf({ webhookUrl: null })).toEqual([]);
    expect(webhookUrlsOf(undefined)).toEqual([]);
  });
  it('ignore les valeurs invalides ou en double dans la liste stockée', () => {
    expect(webhookUrlsOf({ webhookUrls: ['https://a.test/h', 'https://a.test/h', 42, '', null] as unknown[] })).toEqual(['https://a.test/h']);
  });
  it('ajoute sans écraser les autres et sans doublon (plusieurs plugins)', () => {
    const woo = addUrl([], 'https://shop.test/wp-json/coinvera/v1/webhook');
    const dons = addUrl(woo, 'https://shop.test/wp-json/coinvera-donations/v1/webhook');
    expect(dons).toHaveLength(2);
    expect(dons[0]).toContain('/coinvera/v1/webhook');
    expect(addUrl(dons, 'https://shop.test/wp-json/coinvera-donations/v1/webhook')).toEqual(dons);   // idempotent
  });
  it('limite à ' + MAX_WEBHOOKS + ' URL', () => {
    let l: string[] = []; for (let i = 0; i < MAX_WEBHOOKS; i++) l = addUrl(l, `https://s${i}.test/h`);
    expect(() => addUrl(l, 'https://autre.test/h')).toThrow('webhook_limit');
    expect(addUrl(l, 'https://s0.test/h')).toEqual(l);   // déjà présente : pas d'erreur
    expect(() => normalizeUrls(Array.from({ length: MAX_WEBHOOKS + 1 }, (_, i) => `https://s${i}.test/h`))).toThrow('webhook_limit');
  });
  it('refuse les URL dangereuses (SSRF)', () => {
    for (const u of ['http://a.test/h', 'https://localhost/h', 'https://127.0.0.1/h', 'https://intranet.local/h', 'https://x.internal/h', 'https://[::1]/h']) expect(() => safeUrl(u)).toThrow('unsafe_url');
    expect(() => normalizeUrls(['https://ok.test/h', 'http://non.test/h'])).toThrow('unsafe_url');
  });
  it('dédoublonne une saisie après normalisation', () => {
    expect(normalizeUrls(['https://a.test', 'https://a.test/', 'https://b.test/h'])).toEqual(['https://a.test/', 'https://b.test/h']);
  });
});
