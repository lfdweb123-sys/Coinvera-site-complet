import { describe, expect, it, vi } from 'vitest';
// Faux Firestore minimal en mémoire (documents + transactions).
const { store, ref } = vi.hoisted(() => { const store: Record<string, any> = {};
const ref = (p: string): any => ({ path: p, id: p.split('/').pop(), get: async () => ({ exists: p in store, data: () => store[p] }), update: async (u: any) => { store[p] = { ...store[p], ...u }; }, create: async (u: any) => { if (p in store) throw new Error('exists'); store[p] = u; }, set: async (u: any, o?: any) => { store[p] = o?.merge ? { ...store[p], ...u } : u; } });
return { store, ref }; });
vi.mock('@/lib/firebase-admin', () => ({ db: { doc: ref, collection: (c: string) => ({ doc: (id = 'auto' + Math.random().toString(36).slice(2)) => ref(`${c}/${id}`), where: (f: string, _op: string, v: any) => { const q: any = { where: () => q, limit: () => q, get: async () => ({ docs: Object.keys(store).filter(k => k.startsWith(c + '/') && store[k][f] === v).map(k => ({ id: k.slice(c.length + 1), data: () => store[k] })) }) }; return q; } }), runTransaction: async (fn: any) => fn({ get: async (r: any) => r.get(), set: (r: any, u: any, o?: any) => { store[r.path] = o?.merge ? { ...store[r.path], ...u } : u; }, create: (r: any, u: any) => { if (r.path in store) throw new Error('exists'); store[r.path] = u; }, update: (r: any, u: any) => { store[r.path] = { ...store[r.path], ...u }; } }) } }));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'TS' } }));vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'TS' } }));
vi.mock('@/lib/audit', () => ({ notify: vi.fn(async () => {}) }));
vi.mock('@/lib/receipt-events', () => ({ receiptScarabDeposit: vi.fn(async () => {}) }));
const scan = vi.hoisted(() => ({ hits: [] as any[] }));
vi.mock('@/lib/chains', () => ({ scanIncoming: vi.fn(async () => scan.hits) }));
import { checkPayOrder } from '@/lib/scarab/pay';

const mk = (id: string, over: object) => { store[`scarab_pay_orders/${id}`] = { merchantId: 'u1', deposit: true, spec: { kind: 'deposit', amount: '20' }, creditUnits: 20_000_000, cur: 'usdttrc20', decimals: 6, address: 'T', chargeUnits: 20_100_000, expected: '20100000', status: 'awaiting', createdAt: Date.now() - 3 * 3600_000, expiresAt: Date.now() - 2 * 3600_000, ...over }; };
const hit = { txid: 'tx9', amount: 20_100_000n, confirmed: true, ts: Date.now() };
describe('dépôt Pro : paiement tardif', () => {
  it('reçu après 60 min (dans les 7 jours) : crédité une seule fois au crédit cartes pro', async () => {
    mk('d1', {}); scan.hits = [hit]; store['balances/u1'] = { available: 0, scarab_credit: 0 };
    await checkPayOrder('u1', 'd1'); expect(store['scarab_pay_orders/d1'].status).toBe('fulfilled'); expect(store['scarab_pay_orders/d1'].late).toBe(true); expect(store['balances/u1'].scarab_credit).toBe(20_000_000);
    await checkPayOrder('u1', 'd1'); expect(store['balances/u1'].scarab_credit).toBe(20_000_000);
  });
  it('au-delà de 7 jours : surveillance fermée, rien n’est crédité', async () => {
    mk('d2', { status: 'expired', createdAt: Date.now() - 8 * 24 * 3600_000 }); scan.hits = [{ ...hit, txid: 'tx10' }]; store['balances/u2'] = { available: 0, scarab_credit: 0 };
    await checkPayOrder('u1', 'd2'); expect(store['scarab_pay_orders/d2'].status).toBe('closed');
  });
  it('commande d’achat (devis figé) : reste expirée à 60 min', async () => {
    mk('d3', { deposit: false, spec: { kind: 'issue' } }); scan.hits = [{ ...hit, txid: 'tx11' }]; await checkPayOrder('u1', 'd3'); expect(store['scarab_pay_orders/d3'].status).toBe('expired');
  });
});
