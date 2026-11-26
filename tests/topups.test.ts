import { describe, expect, it, vi } from 'vitest';
// Faux Firestore minimal en mémoire (documents + transactions).
const { store, ref } = vi.hoisted(() => { const store: Record<string, any> = {};
const ref = (p: string): any => ({ path: p, id: p.split('/').pop(), get: async () => ({ exists: p in store, data: () => store[p] }), update: async (u: any) => { store[p] = { ...store[p], ...u }; }, create: async (u: any) => { if (p in store) throw new Error('exists'); store[p] = u; }, set: async (u: any, o?: any) => { store[p] = o?.merge ? { ...store[p], ...u } : u; } });
return { store, ref }; });
vi.mock('@/lib/firebase-admin', () => ({ db: { doc: ref, collection: (c: string) => ({ doc: (id = 'auto' + Math.random().toString(36).slice(2)) => ref(`${c}/${id}`), where: (f: string, _op: string, v: any) => { const fl: [string, any][] = [[f, v]]; const q: any = { where: (f2: string, _o: string, v2: any) => { fl.push([f2, v2]); return q; }, limit: () => q, get: async () => ({ docs: Object.keys(store).filter(k => k.startsWith(c + '/') && fl.every(([ff, vv]) => store[k][ff] === vv)).map(k => ({ id: k.slice(c.length + 1), data: () => store[k] })) }) }; return q; } }), runTransaction: async (fn: any) => fn({ get: async (r: any) => r.get(), set: (r: any, u: any, o?: any) => { store[r.path] = o?.merge ? { ...store[r.path], ...u } : u; }, create: (r: any, u: any) => { if (r.path in store) throw new Error('exists'); store[r.path] = u; }, update: (r: any, u: any) => { store[r.path] = { ...store[r.path], ...u }; } }) } }));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'TS' } }));vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'TS' } }));
vi.mock('@/lib/audit', () => ({ notify: vi.fn(async () => {}), merchantEmail: vi.fn(async () => 'client@example.com'), audit: vi.fn(async () => {}) }));
vi.mock('@/lib/receipt-events', () => ({ receiptTopup: vi.fn(async () => {}), receiptWithdrawal: vi.fn(async () => {}) }));
vi.mock('@/lib/admin-alert', () => ({ alertAdmins: vi.fn(async () => {}) }));
vi.mock('@/lib/brevo', () => ({ sendMail: vi.fn(async () => {}) }));
vi.mock('@/lib/pay-amounts', () => ({ reserveAmount: vi.fn(async () => true) }));
const scan = vi.hoisted(() => ({ hits: [] as any[] }));
vi.mock('@/lib/chains', () => ({ scanIncoming: vi.fn(async () => scan.hits), verifyEvmNative: vi.fn(async () => null) }));
process.env.PAY_ADDR_USDT_TRC20 = 'TXaddrPlatform0000000000000000000';
import { createTopup, checkTopup } from '@/lib/topups';

const bal = () => store['balances/m1'] ?? { available: 0 };
describe('recharge du solde par adresse', () => {
  it('montant unique, crédit exact une seule fois, même si on revérifie', async () => {
    const v = await createTopup('m1', 'usdttrc20', '50.00'); expect(v.status).toBe('awaiting'); expect(Number(v.amount)).toBeGreaterThan(50); expect(Number(v.amount)).toBeLessThan(50.01);
    const exp = BigInt(Math.round(Number(v.amount) * 1e6));
    scan.hits = [{ txid: 'tx1', amount: exp - 1n, confirmed: true, ts: Date.now() }]; expect((await checkTopup('m1', v.id)).status).toBe('awaiting'); expect(bal().available).toBe(0);   // mauvais montant : rien
    scan.hits = [{ txid: 'tx1', amount: exp, confirmed: false, ts: Date.now() }]; expect((await checkTopup('m1', v.id)).status).toBe('awaiting');   // non confirmé : rien
    scan.hits = [{ txid: 'tx1', amount: exp, confirmed: true, ts: Date.now() }];
    expect((await checkTopup('m1', v.id)).status).toBe('confirmed'); expect(bal().available).toBe(50_000_000);
    await checkTopup('m1', v.id); expect(bal().available).toBe(50_000_000);
  });
  it('un autre utilisateur ne voit pas la recharge ; montants hors limites refusés', async () => {
    const v = await createTopup('m2', 'usdttrc20', '20.00'); await expect(checkTopup('m3', v.id)).rejects.toThrow('not_found');
    await expect(createTopup('m2', 'usdttrc20', '1.00')).rejects.toThrow('invalid_amount'); await expect(createTopup('m2', 'usdtbsc', '20.00')).rejects.toThrow('currency_unavailable');
  });
  it('paiement reçu après expiration : crédité quand même', async () => {
    const v = await createTopup('m4', 'usdttrc20', '30.00'); store[`balance_topups/${v.id}`].expiresAt = Date.now() - 1000;
    scan.hits = [{ txid: 'late1', amount: BigInt(Math.round(Number(v.amount) * 1e6)), confirmed: true, ts: Date.now() }];
    expect((await checkTopup('m4', v.id)).status).toBe('confirmed'); expect(store['balances/m4'].available).toBe(30_000_000);
  });
  it('un même transfert ne peut pas créditer deux recharges', async () => {
    const a = await createTopup('m5', 'usdttrc20', '10.00'), b = await createTopup('m5', 'usdttrc20', '10.00'); const same = BigInt(Math.round(Number(a.amount) * 1e6));
    store[`balance_topups/${b.id}`].expected = same.toString();
    scan.hits = [{ txid: 'dup', amount: same, confirmed: true, ts: Date.now() }];
    await checkTopup('m5', a.id); await expect(checkTopup('m5', b.id)).rejects.toThrow('tx_already_used'); expect(store['balances/m5'].available).toBe(10_000_000);
  });
});
