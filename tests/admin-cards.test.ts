import { beforeEach, describe, expect, it, vi } from 'vitest';
// Les réglages doivent toujours être renvoyés, même si CryptoInfra ou un indicateur Firestore est en panne ; l'enregistrement refuse proprement les valeurs invalides.
const store: Record<string, any> = {};
vi.mock('@/lib/auth', () => ({ requireAdmin: async () => ({ uid: 'a1' }), fail: (e: any) => Response.json({ error: 'internal_error', m: String(e?.message) }, { status: 500 }), HttpError: class extends Error {} }));
vi.mock('@/lib/audit', () => ({ audit: async () => {} }));
vi.mock('@/lib/log', () => ({ warn: () => {}, info: () => {}, error: () => {} }));
vi.mock('@/lib/cards/cryptoinfra', () => ({ ci: async () => { throw new Error('cards_not_configured'); } }));
vi.mock('firebase-admin/firestore', () => ({ AggregateField: { sum: () => ({}) } }));
vi.mock('@/lib/firebase-admin', () => ({ db: {
  doc: (p: string) => ({ get: async () => ({ data: () => store[p] }), set: async (d: any, o: any) => { store[p] = o?.merge ? { ...(store[p] ?? {}), ...d } : d; } }),
  collection: () => { throw new Error('firestore indisponible'); } } }));
import { GET, PUT } from '@/app/api/admin/cards/route';
const put = (b: unknown) => PUT(new Request('http://x/api/admin/cards', { method: 'PUT', body: JSON.stringify(b) }));
beforeEach(() => { for (const k of Object.keys(store)) delete store[k]; });
describe('admin cartes', () => {
  it('GET renvoie les réglages même quand tous les indicateurs échouent', async () => {
    const r = await GET(new Request('http://x/api/admin/cards')); expect(r.status).toBe(200); const j = await r.json();
    expect(j.settings).toMatchObject({ issueFlat: 1.5, issueBps: 250, loadFlat: 0.3, loadBps: 250, enabled: false, refundAdvance: true }); expect(j.error).toBe('cards_not_configured'); expect(j.advances).toBeNull();
  });
  it('PUT enregistre des valeurs valides', async () => {
    const r = await put({ enabled: true, refundAdvance: true, issueFlat: 1.5, issueBps: 250, loadFlat: 0.3, loadBps: 250 }); expect(r.status).toBe(200); expect(store['card_settings/config']).toMatchObject({ enabled: true, loadBps: 250 });
    expect((await (await GET(new Request('http://x/api/admin/cards'))).json()).settings.enabled).toBe(true);
  });
  it('PUT répond 400 invalid_request (et non 500) à des valeurs vides ou invalides', async () => {
    for (const b of [{ issueFlat: NaN, issueBps: 250 }, { issueBps: 2.5 }, { loadBps: -1 }, { loadBps: 'abc' }]) { const r = await put(b); expect(r.status).toBe(400); expect((await r.json()).error).toBe('invalid_request'); }
  });
});
