import { describe, expect, it, vi } from 'vitest';
// Faux Firestore minimal en mémoire (documents + transactions) pour vérifier la répartition crédit / solde et le remboursement exact.
const { store, ref } = vi.hoisted(() => { const store: Record<string, any> = {};
const ref = (p: string): any => ({ path: p, id: p.split('/').pop(), get: async () => ({ exists: p in store, data: () => store[p] }), update: async (u: any) => { store[p] = { ...store[p], ...u }; }, set: async (u: any, o?: any) => { store[p] = o?.merge ? { ...store[p], ...u } : u; } });
return { store, ref }; });
vi.mock('@/lib/firebase-admin', () => ({ db: { doc: ref, collection: (c: string) => ({ doc: (id = 'auto' + Math.random().toString(36).slice(2)) => ref(`${c}/${id}`) }), runTransaction: async (fn: any) => fn({ get: async (r: any) => r.get(), set: (r: any, u: any, o?: any) => { store[r.path] = o?.merge ? { ...store[r.path], ...u } : u; }, create: (r: any, u: any) => { if (r.path in store) throw new Error('exists'); store[r.path] = u; }, update: (r: any, u: any) => { store[r.path] = { ...store[r.path], ...u }; } }) } }));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'TS' } }));
vi.mock('@/lib/scarab/client', () => ({ sp: vi.fn(async () => { throw new Error('refus'); }), outcomeOf: () => 'definitive', publicCode: () => 'refused', SpError: class extends Error {} }));
vi.mock('@/lib/scarab/settings', () => ({ scarabSettings: async () => ({}), pricingOf: () => ({}) }));
vi.mock('@/lib/scarab/catalog', () => ({ productOf: vi.fn(), wallet: vi.fn(), needsCustomer: () => false }));
vi.mock('@/lib/scarab/customers', () => ({ requireApprovedCustomer: vi.fn() }));
vi.mock('@/lib/scarab/refill', () => ({ ensureScarabFunds: vi.fn() }));
vi.mock('@/lib/scarab/cards', () => ({ ownedCard: vi.fn(), saveCard: vi.fn(), cardRef: vi.fn(), cardPatch: vi.fn(), liveCount: vi.fn(), refreshCard: vi.fn() }));
vi.mock('@/lib/audit', () => ({ notify: vi.fn(async () => {}) }));
vi.mock('@/lib/receipt-events', () => ({ receiptScarabOrder: vi.fn(async () => {}) }));
import { placeOrder } from '@/lib/scarab/orders';

const q: any = { amountMinor: 1000, feeMinor: 100, costFeeMinor: 50, customerId: null, chargeUnits: 11_000_000 };
describe('crédit Virtuals cards pro', () => {
  it('consomme le crédit d’abord, puis le solde ; l’échec rend chaque part à sa source', async () => {
    store['balances/u1'] = { available: 20_000_000, scarab_credit: 4_000_000 };
    await expect(placeOrder('u1', { kind: 'issue', productId: 'p', amount: '10', nameOnCard: 'JEAN DUPONT' }, q, { source: 'balance', fixedId: 'o1' })).rejects.toBeTruthy();
    const b = store['balances/u1']; expect(b.scarab_credit).toBe(4_000_000); expect(b.available).toBe(20_000_000); expect(b.scarab_reserved).toBe(0);
    expect(store['scarab_orders/o1']).toMatchObject({ creditPart: 4_000_000, availPart: 7_000_000, status: 'failed' });
    const l = store['ledger_entries/scarab_reserve_o1'].lines; expect(l.filter((x: any) => x.dir === 'debit').reduce((a: number, x: any) => a + x.amount, 0)).toBe(11_000_000);
  });
  it('crédit seul suffisant : le solde n’est pas touché', async () => {
    store['balances/u2'] = { available: 0, scarab_credit: 15_000_000 };
    await expect(placeOrder('u2', { kind: 'issue', productId: 'p', amount: '10', nameOnCard: 'JEAN DUPONT' }, q, { source: 'balance', fixedId: 'o2' })).rejects.toBeTruthy();
    expect(store['scarab_orders/o2']).toMatchObject({ creditPart: 11_000_000, availPart: 0 }); expect(store['balances/u2'].scarab_credit).toBe(15_000_000);
  });
  it('insuffisant : refusé sans rien réserver', async () => {
    store['balances/u3'] = { available: 1_000_000, scarab_credit: 2_000_000 };
    await expect(placeOrder('u3', { kind: 'issue', productId: 'p', amount: '10', nameOnCard: 'JEAN DUPONT' }, q, { source: 'balance', fixedId: 'o3' })).rejects.toMatchObject({ code: 'insufficient_balance' });
    expect(store['scarab_orders/o3']).toBeUndefined();
  });
});
