import { describe, it, expect, vi, beforeEach } from 'vitest';
const h = vi.hoisted(() => { const store = new Map<string, any>(); const sent: any[] = [];
  const db = { doc: (p: string) => ({ p }), runTransaction: async (fn: any) => fn({ get: async (r: any) => ({ exists: store.has(r.p), data: () => store.get(r.p) }), set: (r: any, v: any) => store.set(r.p, v) }) };
  return { store, sent, db }; });
vi.mock('@/lib/firebase-admin', () => ({ db: h.db }));
vi.mock('@/lib/firebase-admin'.replace('@/', '../'), () => ({ db: h.db }));
vi.mock('../lib/admin-alert', () => ({ alertAdmins: async (s: string, p: string[], r: any) => { h.sent.push({ s, r }); } }));
import { reportCritical, CRIT_HOURLY_CAP } from '../lib/critical';
beforeEach(() => { h.store.clear(); h.sent.length = 0; });
describe('reportCritical', () => {
  it('envoie un e-mail puis supprime le doublon', async () => {
    expect(await reportCritical({ kind: 'client', title: 'Une page a planté', message: 'boom', where: '/dashboard' })).toBe(true);
    expect(await reportCritical({ kind: 'client', title: 'Une page a planté', message: 'boom', where: '/dashboard' })).toBe(false);
    expect(h.sent).toHaveLength(1);
  });
  it('masque les jetons', async () => {
    await reportCritical({ kind: 'server', title: 'x', message: 'Bearer abc.def.ghi failed ?token=SECRET123' });
    const txt = JSON.stringify(h.sent[0].r); expect(txt).not.toContain('abc.def.ghi'); expect(txt).not.toContain('SECRET123');
  });
  it('plafonne le total horaire', async () => {
    for (let i = 0; i < CRIT_HOURLY_CAP + 5; i++) await reportCritical({ kind: 'server', title: 'e' + i });
    expect(h.sent).toHaveLength(CRIT_HOURLY_CAP);
  });
});
