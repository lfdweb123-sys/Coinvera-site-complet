import { beforeEach, describe, expect, it, vi } from 'vitest';
const rows = vi.hoisted(() => ({ docs: [] as any[], fail: false }));
vi.mock('@/lib/firebase-admin', () => ({ db: { collection: () => ({ where: () => ({ limit: () => ({ get: async () => { if (rows.fail) throw new Error('down'); return { docs: rows.docs.map(d => ({ data: () => d })) }; } }) }) }) } }));
import { recentUpdates, resetUpdatesCache, updatesBlock, UPDATES } from '@/lib/ai/updates';
beforeEach(() => { resetUpdatesCache(); rows.docs = []; rows.fail = false; });
describe('nouveautés transmises à l’IA', () => {
  it('fusionne le code et les entrées admin, les plus récentes d’abord', async () => {
    rows.docs = [{ date: '2099-01-01', title: 'Nouveau', text: 'Texte de la nouveauté ajoutée par l’admin.', public: true }];
    const r = await recentUpdates(50); expect(r[0].title).toBe('Nouveau'); expect(r.length).toBe(UPDATES.length + 1); for (let i = 1; i < r.length; i++) expect(r[i - 1].date >= r[i].date).toBe(true);
  });
  it('ignore les entrées invalides et survit à une panne de la source admin', async () => {
    rows.docs = [{ date: 'hier', title: 'x', text: 'y' }, { date: '2026-01-01', title: '', text: 'abc' }]; expect((await recentUpdates(50)).length).toBe(UPDATES.length);
    resetUpdatesCache(); rows.fail = true; expect((await recentUpdates(50)).length).toBe(UPDATES.length);
  });
  it('les visiteurs ne reçoivent que les entrées publiques', async () => {
    rows.docs = [{ date: '2099-01-01', title: 'Interne', text: 'Réservé au tableau de bord.', public: false }, { date: '2099-01-02', title: 'Ouvert', text: 'Visible partout sur le site.', public: true }];
    const v = await updatesBlock('visitor'), a = await updatesBlock('account'); expect(v).toContain('Ouvert'); expect(v).not.toContain('Interne'); expect(a).toContain('Interne'); expect(a).toContain('Ouvert');
  });
});
