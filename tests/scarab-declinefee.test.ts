import { describe, expect, it, vi } from 'vitest';
// Faux Firestore minimal en mémoire : vérifie la répercussion des frais de refus (ordre de prélèvement, solde négatif, idempotence, périmètre).
const { store, ref } = vi.hoisted(() => { const store: Record<string, any> = {};
const ref = (p: string): any => ({ path: p, id: p.split('/').pop(), get: async () => ({ exists: p in store, data: () => store[p] }) });
return { store, ref }; });
vi.mock('@/lib/firebase-admin', () => ({ db: { doc: ref, collection: (c: string) => ({ doc: (id: string) => ref(`${c}/${id}`) }), runTransaction: async (fn: any) => fn({ get: async (r: any) => r.get(), set: (r: any, u: any, o?: any) => { store[r.path] = o?.merge ? { ...store[r.path], ...u } : u; }, create: (r: any, u: any) => { if (r.path in store) throw new Error('exists'); store[r.path] = u; } }) } }));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'TS' } }));
vi.mock('@/lib/auth', () => ({ HttpError: class extends Error { constructor(public status: number, public code: string) { super(code); } } }));
const { notify } = vi.hoisted(() => ({ notify: vi.fn(async () => {}) })); vi.mock('@/lib/audit', () => ({ notify, audit: async () => {} }));
import { chargeCardFee as chargeDeclineFee, splitFee } from '@/lib/scarab/declinefee';
const seed = (uid: string, bal: any) => { store[`scarab_cards/c_${uid}`] = { merchantId: uid, last4: '4821' }; store[`balances/${uid}`] = bal; };
const net = (uid: string) => Object.values(store).filter((e: any) => e?.lines).flatMap((e: any) => e.lines).filter((l: any) => l.account.startsWith(`merchant:${uid}:`)).reduce((a: number, l: any) => a + (l.dir === 'credit' ? l.amount : -l.amount), 0);
const fee = (uid: string, over: any = {}) => ({ uid, cardId: `c_${uid}`, kind: 'decline_violation', amountMinor: 150, violation: 2, ...over });
describe('frais de refus répercutés à l\'utilisateur', () => {
  it('prélève d\'abord le crédit cartes pro, puis le solde disponible, en écriture équilibrée', async () => {
    seed('u1', { available: 5_000_000, scarab_credit: 1_000_000 });
    const r = await chargeDeclineFee(fee('u1'));   // 1,50 $ = 1 000 000 de crédit + 500 000 de solde
    expect(r).toMatchObject({ charged: true, units: 1_500_000, credit: 1_000_000, avail: 500_000, negative: 0 });
    expect(store['balances/u1']).toMatchObject({ available: 4_500_000, scarab_credit: 0 });
    const e = store['ledger_entries/scarab_declfee_c_u1_v2']; expect(e.type).toBe('scarab_decline_fee'); expect(e.lines.reduce((a: number, l: any) => a + (l.dir === 'debit' ? l.amount : -l.amount), 0)).toBe(0);
    expect(net('u1')).toBe(-1_500_000); expect(notify).toHaveBeenCalledTimes(1);
  });
  it('un événement rejoué ne débite jamais deux fois', async () => {
    seed('u2', { available: 10_000_000 }); await chargeDeclineFee(fee('u2')); const again = await chargeDeclineFee(fee('u2'));
    expect(again.charged).toBe(false); expect(store['balances/u2'].available).toBe(8_500_000);
  });
  it('le 3ᵉ refus est un autre frais (une écriture par numéro de refus)', async () => {
    seed('u3', { available: 10_000_000 }); await chargeDeclineFee(fee('u3')); await chargeDeclineFee(fee('u3', { violation: 3 }));
    expect(store['balances/u3'].available).toBe(7_000_000);
  });
  it('solde insuffisant : le solde devient négatif (dette régularisée par le prochain encaissement)', async () => {
    seed('u4', { available: 500_000, scarab_credit: 0 }); const r = await chargeDeclineFee(fee('u4'));
    expect(r).toMatchObject({ charged: true, avail: 1_500_000, negative: 1_000_000 }); expect(store['balances/u4'].available).toBe(-1_000_000);
  });
  it('ignore les autres frais (hors refus), un montant nul et une carte d\'un autre utilisateur', async () => {
    seed('u5', { available: 5_000_000 });
    expect((await chargeDeclineFee(fee('u5', { kind: 'autre_frais' }))).charged).toBe(false);
    expect((await chargeDeclineFee(fee('u5', { amountMinor: 0 }))).charged).toBe(false);
    store['scarab_cards/c_other'] = { merchantId: 'someone-else' };
    expect((await chargeDeclineFee({ ...fee('u5'), cardId: 'c_other' })).charged).toBe(false);
    expect(store['balances/u5'].available).toBe(5_000_000);
  });
  it('frais hors États-Unis : répercutés aussi, une seule fois par transaction, avec leur propre type d\'écriture', async () => {
    seed('u6', { available: 5_000_000, scarab_credit: 0 }); const x = { kind: 'cross_border', amountMinor: 70, violation: null, txId: 'tx_abc' };
    expect(await chargeDeclineFee(fee('u6', x))).toMatchObject({ charged: true, units: 700_000 });
    expect((await chargeDeclineFee(fee('u6', x))).charged).toBe(false);
    expect(store['balances/u6'].available).toBe(4_300_000); expect(store['ledger_entries/scarab_cbfee_tx_abc'].type).toBe('scarab_cross_border_fee');
    expect((await chargeDeclineFee(fee('u6', { ...x, txId: 'tx_def' }))).charged).toBe(true); expect(store['balances/u6'].available).toBe(3_600_000);
  });
  it('répartition : le crédit passe avant le solde', () => { expect(splitFee({ scarab_credit: 300 }, 1000)).toEqual({ credit: 300, avail: 700 }); expect(splitFee({}, 1000)).toEqual({ credit: 0, avail: 1000 }); });
});
