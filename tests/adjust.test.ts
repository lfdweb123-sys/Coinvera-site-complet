import { describe, expect, it, vi } from 'vitest';
// Faux Firestore minimal en mémoire (documents + transactions) pour vérifier les écritures comptables d'un ajustement manuel.
const { store, ref } = vi.hoisted(() => { const store: Record<string, any> = {};
const ref = (p: string): any => ({ path: p, id: p.split('/').pop(), get: async () => ({ exists: p in store, data: () => store[p] }) });
return { store, ref }; });
vi.mock('@/lib/firebase-admin', () => ({ db: { doc: ref, collection: (c: string) => ({ doc: (id = 'a' + Math.random().toString(36).slice(2)) => ref(`${c}/${id}`) }), runTransaction: async (fn: any) => fn({ get: async (r: any) => r.get(), set: (r: any, u: any, o?: any) => { store[r.path] = o?.merge ? { ...store[r.path], ...u } : u; }, create: (r: any, u: any) => { if (r.path in store) throw new Error('exists'); store[r.path] = u; } }) } }));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'TS' } }));
vi.mock('@/lib/auth', () => ({ HttpError: class extends Error { constructor(public status: number, public code: string) { super(code); } } }));
import { adjustBalance } from '@/lib/adjust';
const net = (m: string) => Object.values(store).filter((e: any) => e?.lines).flatMap((e: any) => e.lines).filter((l: any) => l.account.startsWith(`merchant:${m}:`)).reduce((a: number, l: any) => a + (l.dir === 'credit' ? l.amount : -l.amount), 0);
describe('ajustement manuel du solde', () => {
  it('crédit : solde +, écriture équilibrée, trace conservée', async () => {
    store['merchants/m1'] = { email: 'a@b.c' }; store['balances/m1'] = { available: 5_000_000 };
    const r = await adjustBalance({ adminUid: 'adm', merchantId: 'm1', direction: 'credit', amount: '12.50', reason: 'Geste commercial' });
    expect(store['balances/m1'].available).toBe(17_500_000); expect(r).toMatchObject({ before: 5_000_000, after: 17_500_000 });
    const e = store[`ledger_entries/admin_adj_${r.id}`]; expect(e.type).toBe('admin_adjustment'); expect(e.lines.reduce((a: number, l: any) => a + (l.dir === 'debit' ? l.amount : -l.amount), 0)).toBe(0);
    expect(store[`admin_adjustments/${r.id}`]).toMatchObject({ adminUid: 'adm', direction: 'credit', reason: 'Geste commercial', amountUnits: 12_500_000 });
  });
  it('retrait : solde −, et le registre reste égal au solde (réconciliation)', async () => {
    store['merchants/m2'] = {}; store['balances/m2'] = { available: 0 };
    await adjustBalance({ adminUid: 'adm', merchantId: 'm2', direction: 'credit', amount: '100', reason: 'Dépôt manuel' });
    await adjustBalance({ adminUid: 'adm', merchantId: 'm2', direction: 'debit', amount: '30.25', reason: 'Correction' });
    expect(store['balances/m2'].available).toBe(69_750_000); expect(net('m2')).toBe(69_750_000);
  });
  it('refuse un retrait supérieur au solde, un montant nul ou excessif, un marchand inconnu, un administrateur', async () => {
    store['merchants/m3'] = {}; store['balances/m3'] = { available: 1_000_000 };
    await expect(adjustBalance({ adminUid: 'a', merchantId: 'm3', direction: 'debit', amount: '1.01', reason: 'xxxxx' })).rejects.toMatchObject({ code: 'insufficient_balance' });
    expect(store['balances/m3'].available).toBe(1_000_000);
    await expect(adjustBalance({ adminUid: 'a', merchantId: 'm3', direction: 'credit', amount: '0', reason: 'xxxxx' })).rejects.toMatchObject({ code: 'amount_out_of_limits' });
    await expect(adjustBalance({ adminUid: 'a', merchantId: 'm3', direction: 'credit', amount: '100000.01', reason: 'xxxxx' })).rejects.toMatchObject({ code: 'amount_out_of_limits' });
    await expect(adjustBalance({ adminUid: 'a', merchantId: 'nope', direction: 'credit', amount: '1', reason: 'xxxxx' })).rejects.toMatchObject({ code: 'not_found' });
    store['merchants/adm1'] = {}; store['admins/adm1'] = {};
    await expect(adjustBalance({ adminUid: 'a', merchantId: 'adm1', direction: 'credit', amount: '1', reason: 'xxxxx' })).rejects.toMatchObject({ code: 'protected_admin' });
  });
});
