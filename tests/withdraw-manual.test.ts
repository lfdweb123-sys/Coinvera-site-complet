import { describe, expect, it, vi } from 'vitest';
// Faux Firestore minimal en mémoire (documents + transactions).
const { store, ref } = vi.hoisted(() => { const store: Record<string, any> = {};
const ref = (p: string): any => ({ path: p, id: p.split('/').pop(), get: async () => ({ exists: p in store, data: () => store[p] }), update: async (u: any) => { store[p] = { ...store[p], ...u }; }, create: async (u: any) => { if (p in store) throw new Error('exists'); store[p] = u; }, set: async (u: any, o?: any) => { store[p] = o?.merge ? { ...store[p], ...u } : u; } });
return { store, ref }; });
vi.mock('@/lib/firebase-admin', () => ({ db: { doc: ref, collection: (c: string) => ({ doc: (id = 'auto' + Math.random().toString(36).slice(2)) => ref(`${c}/${id}`), where: (f: string, _op: string, v: any) => { const q: any = { limit: () => q, get: async () => ({ docs: Object.keys(store).filter(k => k.startsWith(c + '/') && store[k][f] === v).map(k => ({ id: k.slice(c.length + 1), data: () => store[k] })) }) }; return q; } }), runTransaction: async (fn: any) => fn({ get: async (r: any) => r.get(), set: (r: any, u: any, o?: any) => { store[r.path] = o?.merge ? { ...store[r.path], ...u } : u; }, create: (r: any, u: any) => { if (r.path in store) throw new Error('exists'); store[r.path] = u; }, update: (r: any, u: any) => { store[r.path] = { ...store[r.path], ...u }; } }) } }));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'TS' } }));vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'TS' } }));
vi.mock('@/lib/audit', () => ({ notify: vi.fn(async () => {}), merchantEmail: vi.fn(async () => 'client@example.com'), audit: vi.fn(async () => {}) }));
vi.mock('@/lib/receipt-events', () => ({ receiptWithdrawal: vi.fn(async () => {}) }));
const alert = vi.hoisted(() => ({ fn: vi.fn(async () => {}) }));
vi.mock('@/lib/admin-alert', () => ({ alertAdmins: alert.fn }));
const st = vi.hoisted(() => ({ mode: 'manual' }));
vi.mock('@/lib/settings', () => ({ getSettings: async () => ({ withdrawalMode: st.mode, minWithdrawalUsd: 5, maxWithdrawalUsd: 10000, withdrawFeeUsd: 1 }) }));
vi.mock('@/lib/address', () => ({ validAddress: () => true }));
vi.mock('@/lib/bybit-fees', () => ({ withdrawFeeUsd: async () => ({ usd: '1' }) }));
vi.mock('@/lib/payout-options', () => ({ OPT: { trc20: { id: 'trc20', coin: 'USDT', chain: 'TRX' } }, feeOf: () => 1 }));
import { requestWithdrawal, finishWithdrawal } from '@/lib/withdraw';
const seed = (uid: string, available: number) => { store[`balances/${uid}`] = { available, reserved: 0, totalWithdrawn: 0 }; };

describe('retraits par adresse : validation manuelle', () => {
  it('mode manuel : le retrait attend l’admin, les fonds sont réservés ; la validation les consomme une fois', async () => {
    seed('u1', 100e6); st.mode = 'manual'; const id = await requestWithdrawal('u1', { chain: 'trc20', address: 'Taddr', amountUnits: 40e6 });
    expect(store[`withdrawals/${id}`].status).toBe('pending_admin'); expect(store['balances/u1']).toMatchObject({ available: 60e6, reserved: 40e6 }); await new Promise(r => setTimeout(r, 10)); expect(alert.fn).toHaveBeenCalled();
    expect(await finishWithdrawal(id, true, { txHash: 'abc12345' })).toBe(true); expect(await finishWithdrawal(id, true, { txHash: 'abc12345' })).toBe(false);
    expect(store['balances/u1']).toMatchObject({ available: 60e6, reserved: 0, totalWithdrawn: 40e6 }); expect(store[`withdrawals/${id}`].status).toBe('completed');
  });
  it('refus : les fonds reviennent sur le disponible, une seule fois', async () => {
    for (const k of Object.keys(store)) delete store[k]; seed('u2', 50e6); const id = await requestWithdrawal('u2', { chain: 'trc20', address: 'Taddr', amountUnits: 20e6 });
    expect(await finishWithdrawal(id, false, { reason: 'x' }, 'x')).toBe(true); expect(await finishWithdrawal(id, false, {})).toBe(false);
    expect(store['balances/u2']).toMatchObject({ available: 50e6, reserved: 0 }); expect(store[`withdrawals/${id}`].status).toBe('failed');
  });
  it('mode automatique conservé : le retrait part en file Bybit', async () => {
    for (const k of Object.keys(store)) delete store[k]; seed('u3', 50e6); st.mode = 'auto'; const id = await requestWithdrawal('u3', { chain: 'trc20', address: 'Taddr', amountUnits: 20e6 });
    expect(store[`withdrawals/${id}`].status).toBe('queued');
  });
  it('solde insuffisant refusé', async () => {
    for (const k of Object.keys(store)) delete store[k]; seed('u4', 10e6); st.mode = 'manual'; await expect(requestWithdrawal('u4', { chain: 'trc20', address: 'Taddr', amountUnits: 20e6 })).rejects.toThrow('insufficient_balance');
  });
});
