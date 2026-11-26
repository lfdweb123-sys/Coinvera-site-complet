import { describe, expect, it, vi } from 'vitest';
const { store, ref, state } = vi.hoisted(() => { const store: Record<string, any> = {}; const state = { alerts: [] as string[], withdrawals: 0, mode: 'throw' as 'throw' | 'ok', available: 0 };
const ref = (p: string): any => ({ path: p, get: async () => ({ exists: p in store, data: () => store[p] }), update: async (u: any) => { store[p] = { ...store[p], ...u }; }, set: async (u: any, o?: any) => { store[p] = o?.merge ? { ...store[p], ...u } : u; } });
return { store, ref, state }; });
vi.mock('@/lib/firebase-admin', () => ({ db: { doc: ref, collection: () => ({ where: () => ({ get: async () => ({ docs: [] }) }) }), runTransaction: async (fn: any) => fn({ get: async (r: any) => r.get(), set: (r: any, u: any) => { store[r.path] = u; } }) } }));
vi.mock('@/lib/bybit', () => ({ bybitConfigured: () => true, createWithdrawal: vi.fn(async () => { state.withdrawals++; if (state.mode === 'throw') throw new Error('bybit_reponse_illisible (HTTP 403)'); return { retCode: 0, retMsg: 'ok', result: { id: 'w1' } }; }) }));
vi.mock('@/lib/cards/settings', () => ({ cardSettings: async () => ({ refillAuto: true, refillMin: 25, refillMax: 300, refillDaily: 1500, refillBuffer: 1 }) }));
vi.mock('@/lib/cards/refill', () => ({ alertRefill: vi.fn(async (k: string) => { state.alerts.push(k); }) }));
vi.mock('@/lib/scarab/catalog', () => ({ wallet: async () => ({ availableMinor: state.available * 100 }) }));
vi.mock('@/lib/scarab/settings', () => ({ scarabSettings: async () => ({ enabled: true }) }));
vi.mock('@/lib/scarab/pay', () => ({ depositAddresses: async () => ({ usdttrc20: 'TXaddr' }), depositRate: async () => 0.999 }));
import { ensureScarabFunds, refillBlock, unblockRefill } from '@/lib/scarab/refill';
describe('alimentation automatique : pas de répétition ni d’e-mails dans le vide', () => {
  it('portefeuille bas sans aucune demande d’achat : rien (ni retrait ni e-mail)', async () => {
    await ensureScarabFunds(); expect(state.withdrawals).toBe(0); expect(state.alerts).toEqual([]);
  });
  it('un achat bloqué déclenche un seul retrait ; s’il échoue, un seul e-mail puis blocage total', async () => {
    await ensureScarabFunds(7.5); expect(state.withdrawals).toBe(1); expect(state.alerts.length).toBe(1); expect((await refillBlock())?.reason).toBe('unknown');
    store['scarab_refill_lock/current'].until = 0;   // même une fois le verrou de 30 min expiré
    for (let i = 0; i < 5; i++) { await ensureScarabFunds(7.5); await ensureScarabFunds(); }
    expect(state.withdrawals).toBe(1); expect(state.alerts.length).toBe(1);
  });
  it('après l’action de l’administrateur, l’alimentation repart', async () => {
    await unblockRefill(); expect(await refillBlock()).toBeNull(); state.mode = 'ok'; await ensureScarabFunds(7.5); expect(state.withdrawals).toBe(2); expect(store[Object.keys(store).find(k => k.startsWith('scarab_refills/'))!]).toBeDefined();
  });
  it('portefeuille suffisant : rien', async () => { state.available = 500; const n = state.withdrawals; await unblockRefill(); await ensureScarabFunds(7.5); expect(state.withdrawals).toBe(n); });
});
