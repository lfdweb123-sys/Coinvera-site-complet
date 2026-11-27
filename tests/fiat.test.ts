import { describe, expect, it, vi } from 'vitest';
// Faux Firestore minimal en mémoire (documents + transactions).
const { store, ref } = vi.hoisted(() => { const store: Record<string, any> = {};
const ref = (p: string): any => ({ path: p, id: p.split('/').pop(), get: async () => ({ exists: p in store, data: () => store[p] }), update: async (u: any) => { store[p] = { ...store[p], ...u }; }, create: async (u: any) => { if (p in store) throw new Error('exists'); store[p] = u; }, set: async (u: any, o?: any) => { store[p] = o?.merge ? { ...store[p], ...u } : u; } });
return { store, ref }; });
vi.mock('@/lib/firebase-admin', () => ({ db: { doc: ref, collection: (c: string) => ({ doc: (id = 'auto' + Math.random().toString(36).slice(2)) => ref(`${c}/${id}`), where: (f: string, _op: string, v: any) => { const q: any = { limit: () => q, get: async () => ({ docs: Object.keys(store).filter(k => k.startsWith(c + '/') && store[k][f] === v).map(k => ({ id: k.slice(c.length + 1), data: () => store[k] })) }) }; return q; } }), runTransaction: async (fn: any) => fn({ get: async (r: any) => r.get(), set: (r: any, u: any, o?: any) => { store[r.path] = o?.merge ? { ...store[r.path], ...u } : u; }, create: (r: any, u: any) => { if (r.path in store) throw new Error('exists'); store[r.path] = u; }, update: (r: any, u: any) => { store[r.path] = { ...store[r.path], ...u }; } }) } }));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'TS' } }));
const status = vi.hoisted(() => ({ next: { status: 'PENDING', reference: null as string | null, amount: null as number | null } }));
const hist = vi.hoisted(() => ({ rows: [] as any[] }));
vi.mock('@/lib/fiat/feexpay', async orig => ({ ...(await orig<any>()), statusOf: vi.fn(async () => status.next), history: vi.fn(async () => hist.rows), feexConfigured: () => true, bmoCancel: vi.fn(async () => {}) }));
vi.mock('@/lib/audit', () => ({ notify: vi.fn(async () => {}), merchantEmail: vi.fn(async () => 'client@example.com') }));
vi.mock('@/lib/receipt-events', () => ({ receiptFiatDeposit: vi.fn(async () => {}) }));
vi.mock('@/lib/brevo', () => ({ sendMail: vi.fn(async () => {}) }));
import { quoteLocal, needUnits, FIAT_DEFAULTS, gainEstimateUsd, effectiveRate } from '@/lib/fiat/quote';
import { normalizePhone, methodById, METHODS } from '@/lib/fiat/methods';
import { parseRates, mergeRates } from '@/lib/fiat/rates';
import { normalizeInit, parseStatus, buildBody } from '@/lib/fiat/feexpay';
import { sanitize } from '@/lib/fiat/settings';
import { checkFiatOrder, creditFiat, onWebhook, resolveFiat, reconcileFiat } from '@/lib/fiat/orders';
import { verifyFeexWebhook, sign } from '@/lib/fiat/webhook';
import { mapError } from '@/lib/fiat/feexpay';

describe('conversion : jamais de perte, toujours un gain', () => {
  it('pire cas (frais + monnaie qui perd la valeur du coussin) : on récupère au moins dollars + marge', () => {
    for (const cur of ['XOF', 'NGN'] as const) for (const usd of [5, 7.5, 20, 99.99, 250, 1000, 2500]) for (const rate of cur === 'XOF' ? [560, 610.5, 655.957, 700] : [900, 1450, 1620.33, 3000]) for (const fee of [0, 150, 300, 800]) {
      const s = { ...FIAT_DEFAULTS, feeBps: fee }; const u = Math.round(usd * 1e6), local = quoteLocal(u, rate, s, cur), buf = cur === 'XOF' ? s.bufferXofBps : s.bufferNgnBps;
      expect(Number.isInteger(local)).toBe(true);
      const worst = (local * (1 - fee / 1e4)) / (rate * (1 + buf / 1e4)); expect(worst * 1e6).toBeGreaterThanOrEqual(needUnits(u, s) - 1);   // récupéré >= dollars + marge, même si la monnaie perd le coussin
      expect(worst).toBeGreaterThan(usd + s.minGainUsd - 1e-6);
      expect(gainEstimateUsd(local, rate, fee, u)).toBeGreaterThanOrEqual(s.minGainUsd);                                     // au taux du marché : gain >= gain minimum
    }
  });
  it('marge à zéro : toujours au moins le gain minimum et l’arrondi supérieur', () => {
    const s = { ...FIAT_DEFAULTS, marginBps: 0, minGainUsd: 0.1, feeBps: 0, bufferXofBps: 0 }; const l = quoteLocal(10_000_000, 600, s, 'XOF'); expect(l).toBe(Math.ceil(10.1 * 600));
  });
  it('croissant avec le montant, et le taux plancher de l’admin l’emporte sur un taux trop bas', () => {
    const s = { ...FIAT_DEFAULTS, floorXof: 640 }; expect(effectiveRate(500, s, 'XOF')).toBe(640); expect(effectiveRate(700, s, 'XOF')).toBe(700);
    expect(quoteLocal(20_000_000, 640, s, 'XOF')).toBeGreaterThan(quoteLocal(10_000_000, 640, s, 'XOF'));
  });
  it('entrées invalides refusées', () => { expect(() => quoteLocal(10e6, 0, FIAT_DEFAULTS, 'XOF')).toThrow(); expect(() => quoteLocal(0, 600, FIAT_DEFAULTS, 'XOF')).toThrow(); expect(() => quoteLocal(10e6, 600, { ...FIAT_DEFAULTS, feeBps: 10000 }, 'XOF')).toThrow(); });
  it('réglages : bornes appliquées, valeurs absurdes ramenées', () => {
    const s = sanitize({ enabled: true, marginBps: 999999, feeBps: -5, depositMin: 50, depositMax: 10, minGainUsd: 'abc' });
    expect(s).toMatchObject({ enabled: true, marginBps: 3000, feeBps: 0, minGainUsd: FIAT_DEFAULTS.minGainUsd }); expect(s.depositMin).toBeLessThanOrEqual(s.depositMax); expect(sanitize(undefined).enabled).toBe(false);
  });
});
describe('taux de change', () => {
  it('écarte un taux hors bornes et retient le plus élevé des sources', () => {
    expect(parseRates({ rates: { XOF: 600, NGN: 1500 } })).toEqual({ XOF: 600, NGN: 1500 }); expect(parseRates({ rates: { XOF: 6, NGN: 1e9 } })).toEqual({}); expect(parseRates(null)).toEqual({});
    expect(mergeRates([{ XOF: 600, NGN: 1500 }, { XOF: 612 }])).toEqual({ XOF: 612, NGN: 1500 });
  });
});
describe('numéros et méthodes', () => {
  it('formats attendus par FeexPay', () => {
    expect(normalizePhone(methodById('mtn')!, '01 66 00 00 00')).toBe('2290166000000'); expect(normalizePhone(methodById('mtn')!, '+229 0166000000')).toBe('2290166000000'); expect(normalizePhone(methodById('mtn')!, '66000000')).toBeNull();
    expect(normalizePhone(methodById('moov_tg')!, '90 12 34 56')).toBe('22890123456'); expect(normalizePhone(methodById('moov_tg')!, '+22890123456')).toBe('22890123456');
    expect(normalizePhone(methodById('wave_sn')!, '771740000')).toBe('221771740000'); expect(normalizePhone(methodById('orange_ci')!, '0707070707')).toBe('2250707070707');
    expect(normalizePhone(methodById('bmo')!, '0167399785')).toBe('0167399785'); expect(normalizePhone(methodById('bmo')!, '+2290167399785')).toBe('0167399785'); expect(normalizePhone(methodById('bmo')!, '167399785')).toBeNull();
    expect(normalizePhone(methodById('mtn')!, 'abc')).toBeNull();
  });
  it('catalogue : identifiants uniques, monnaies cohérentes', () => {
    expect(new Set(METHODS.map(m => m.id)).size).toBe(METHODS.length); expect(METHODS.filter(m => m.cur === 'NGN').map(m => m.id).sort()).toEqual(['bank_transfer_ng', 'pay_with_bank_ng']);
  });
  it('corps de requête', () => {
    process.env.FEEXPAY_SHOP_ID = 'shop1';
    const b = { amount: 13450, phone: '2290166000000', description: 'Coinvera credit cartes', callbackInfo: 'ord1', returnUrl: 'https://x/y', cancelUrl: 'https://x/z', otp: undefined as string | undefined, bankCode: '100004' };
    expect(buildBody(methodById('mtn')!, b)).toEqual({ shop: 'shop1', amount: 13450, description: 'Coinvera credit cartes', callback_info: 'ord1', phoneNumber: '2290166000000' });
    expect(buildBody(methodById('coris')!, b)).toMatchObject({ otp: '' }); expect(buildBody(methodById('coris')!, { ...b, otp: '4524' })).toMatchObject({ otp: '4524' });
    expect(buildBody(methodById('orange_bf')!, { ...b, otp: '123456' })).toMatchObject({ otp: '123456' });
    expect(buildBody(methodById('wave_sn')!, b)).toMatchObject({ return_url: 'https://x/y', cancel_url: 'https://x/z' });
    const p = buildBody(methodById('pay_with_bank_ng')!, { ...b, phone: undefined }); expect(p).toMatchObject({ bank_code: '100004', redirect_url: 'https://x/y' }); expect(p).not.toHaveProperty('phoneNumber'); expect(p).not.toHaveProperty('cancel_url');
  });
  it('réponses FeexPay', () => {
    expect(normalizeInit({ reference: 'r1', status: 'pending', amount_expected: 5000, bank_account: { account_name: 'N', account_number: '1494901612', bank_name: 'Wema Bank', expires_at: '2026-11-20T17:43:59.845Z' } })).toMatchObject({ reference: 'r1', status: 'PENDING', amountExpected: 5000, bank: { number: '1494901612' } });
    expect(normalizeInit({ order_id: 'o9', payment_url: 'https://pay.wave.com/c/x' })).toMatchObject({ reference: 'o9', paymentUrl: 'https://pay.wave.com/c/x' }); expect(normalizeInit({ reference: 'r', payment_url: 'javascript:alert(1)' }).paymentUrl).toBeNull();
    expect(normalizeInit({ requires_otp: true, reference: 'b' }).requiresOtp).toBe(true); expect(parseStatus({ status: 'successful', reference: 'r1', amount: 100 })).toEqual({ status: 'SUCCESSFUL', reference: 'r1', amount: 100 }); expect(parseStatus({ data: { status: 'FAILED' } }).status).toBe('FAILED'); expect(parseStatus({}).status).toBe('');
  });
});
const order = (id: string, o: any = {}) => { store[`fiat_orders/${id}`] = { merchantId: 'u1', scope: 'scarab', methodId: 'mtn', cc: 'BJ', cur: 'XOF', label: 'FCFA', local: 13450, creditUnits: 20_000_000, rate: 656, liveRate: 650, feeBps: 300, status: 'awaiting', reference: 'ref_' + id, createdAt: Date.now(), expiresAt: Date.now() + 60_000, ...o }; store[`fiat_refs/ref_${id}`] = { orderId: id }; };
describe('crédit des dépôts', () => {
  it('SUCCESSFUL : crédite exactement le montant demandé sur le bon crédit, une seule fois', async () => {
    order('a1'); store['balances/u1'] = { available: 5_000_000, scarab_credit: 1_000_000 }; status.next = { status: 'SUCCESSFUL', reference: 'ref_a1', amount: 13450 };
    expect((await checkFiatOrder('u1', 'a1', { force: true })).status).toBe('fulfilled');
    expect(store['balances/u1']).toMatchObject({ available: 5_000_000, scarab_credit: 21_000_000 }); expect(store['fiat_orders/a1']).toMatchObject({ status: 'fulfilled', creditedUnits: 20_000_000 }); expect(store['fiat_orders/a1'].gainUsd).toBeGreaterThan(0);
    await onWebhook('ref_a1'); await checkFiatOrder(null, 'a1', { force: true }); expect(await creditFiat('a1', 'again')).toBe(false); expect(store['balances/u1'].scarab_credit).toBe(21_000_000);
    const l = store['ledger_entries/fiat_deposit_a1'].lines; expect(l.reduce((a: number, x: any) => a + (x.dir === 'debit' ? x.amount : -x.amount), 0)).toBe(0);
  });
  it('cartes virtuelles : crédit sur card_credit', async () => {
    order('a2', { scope: 'cards' }); store['balances/u1'] = { available: 0 }; status.next = { status: 'SUCCESSFUL', reference: 'ref_a2', amount: null };
    await checkFiatOrder('u1', 'a2', { force: true }); expect(store['balances/u1']).toMatchObject({ card_credit: 20_000_000 }); expect(store['balances/u1'].scarab_credit).toBeUndefined();
  });
  it('recharge du solde (balance) : crédit sur le solde disponible, une seule fois', async () => {
    order('a2b', { scope: 'balance' }); store['balances/u1'] = { available: 3_000_000 }; status.next = { status: 'SUCCESSFUL', reference: 'ref_a2b', amount: null };
    await checkFiatOrder('u1', 'a2b', { force: true }); expect(store['balances/u1'].available).toBe(23_000_000); expect(store['balances/u1'].card_credit).toBeUndefined();
    expect(await creditFiat('a2b', 'again')).toBe(false); expect(store['balances/u1'].available).toBe(23_000_000);
  });
  it('en attente / échec : rien n’est crédité', async () => {
    order('a3'); store['balances/u3'] = { available: 0 }; store['fiat_orders/a3'].merchantId = 'u3'; status.next = { status: 'PENDING', reference: 'ref_a3', amount: null };
    expect((await checkFiatOrder('u3', 'a3', { force: true })).status).toBe('awaiting'); status.next = { status: 'FAILED', reference: 'ref_a3', amount: null };
    expect((await checkFiatOrder('u3', 'a3', { force: true })).status).toBe('failed'); expect(store['balances/u3']).toEqual({ available: 0 }); expect(await creditFiat('a3', 'x')).toBe(false);
  });
  it('référence différente ou montant inférieur : pas de crédit automatique', async () => {
    order('a4'); store['balances/u4'] = { available: 0 }; store['fiat_orders/a4'].merchantId = 'u4'; status.next = { status: 'SUCCESSFUL', reference: 'autre', amount: 13450 };
    expect((await checkFiatOrder('u4', 'a4', { force: true })).status).toBe('awaiting'); status.next = { status: 'SUCCESSFUL', reference: 'ref_a4', amount: 100 };
    expect((await checkFiatOrder('u4', 'a4', { force: true })).status).toBe('review'); expect(store['balances/u4']).toEqual({ available: 0 });
    await resolveFiat('a4', 'credit'); expect(store['balances/u4'].scarab_credit).toBe(20_000_000);
  });
  it('un autre utilisateur ne peut pas lire ni déclencher la commande ; référence inconnue ignorée', async () => {
    order('a5'); await expect(checkFiatOrder('intrus', 'a5')).rejects.toMatchObject({ code: 'not_found' }); expect(await onWebhook('inconnue')).toBe(false);
  });
  it('paiement tardif (commande expirée) : crédité quand même', async () => {
    order('a6', { status: 'expired', expiresAt: Date.now() - 1000 }); store['balances/u1'] = {}; status.next = { status: 'SUCCESSFUL', reference: 'ref_a6', amount: null };
    expect((await checkFiatOrder(null, 'a6', { force: true })).status).toBe('fulfilled'); expect(store['balances/u1'].scarab_credit).toBe(20_000_000);
  });
  it('refusé par l’admin : plus jamais de crédit', async () => {
    order('a7', { status: 'review' }); await resolveFiat('a7', 'reject'); expect(await creditFiat('a7', 'x')).toBe(false);
  });
});

describe('signature du webhook (vecteur de test FeexPay)', () => {
  const secret = 'fxp_whsec_test_9vQ2kXr7LmN4pT8wZ1yB6cD3fH5jK0sA', ts = '1762790400', id = '9b2f6c1e-4d7a-4b8e-a1c3-5e6f7a8b9c0d', raw = '{"reference":"1e636dff-6b81-499e-bf8b-64b4a07a02a8","status":"SUCCESSFUL","amount":250}', good = 'eea4da5dab69a92b2daf07af713c0a474b7bcc1fdaf5b4bea38ff22b63300664';
  const now = 1762790400_000;
  it('retrouve exactement la signature de la documentation', () => { expect(sign(secret, ts, id, raw)).toBe(good); });
  it('accepte une signature valide, y compris parmi deux (renouvellement)', () => {
    expect(verifyFeexWebhook(raw, { timestamp: ts, deliveryId: id, signature: 'v1=' + good }, secret, now)).toBe(true);
    expect(verifyFeexWebhook(raw, { timestamp: ts, deliveryId: id, signature: 'v1=' + 'a'.repeat(64) + ', v1=' + good }, secret, now + 200_000)).toBe(true);
  });
  it('refuse : corps modifié, mauvais secret, identifiant modifié, absent, trop ancien, mauvais format', () => {
    const h = { timestamp: ts, deliveryId: id, signature: 'v1=' + good };
    expect(verifyFeexWebhook(raw.replace('250', '999999'), h, secret, now)).toBe(false); expect(verifyFeexWebhook(raw, h, secret + 'x', now)).toBe(false);
    expect(verifyFeexWebhook(raw, { ...h, deliveryId: 'autre' }, secret, now)).toBe(false); expect(verifyFeexWebhook(raw, { ...h, signature: null }, secret, now)).toBe(false);
    expect(verifyFeexWebhook(raw, h, secret, now + 301_000)).toBe(false); expect(verifyFeexWebhook(raw, h, secret, now - 301_000)).toBe(false);
    expect(verifyFeexWebhook(raw, { ...h, signature: good }, secret, now)).toBe(false); expect(verifyFeexWebhook(raw, { ...h, signature: 'v2=' + good }, secret, now)).toBe(false);
    expect(verifyFeexWebhook(raw, { ...h, timestamp: 'abc' }, secret, now)).toBe(false);
  });
});
describe('codes d’erreur FeexPay', () => {
  it('traduits en codes Coinvera', () => {
    expect(mapError(400, 'ERR_INVALID_PHONE_NUMBER', '').code).toBe('invalid_phone'); expect(mapError(400, 'ERR_INVALID_AMOUNT', '').code).toBe('amount_invalid'); expect(mapError(503, 'NETWORK_UNAVAILABLE', '').code).toBe('network_unavailable');
    expect(mapError(403, 'IP_NOT_ALLOWED', '').code).toBe('fiat_unavailable'); expect(mapError(401, '', '').code).toBe('fiat_unavailable'); expect(mapError(502, '', 'Bad Gateway').code).toBe('provider_unavailable'); expect(mapError(400, '', 'x').code).toBe('payment_rejected');
  });
  it('statut « IN PENDING STATE » = en attente', () => { expect(parseStatus({ status: 'IN PENDING STATE' }).status).toBe('PENDING'); });
});
describe('rapprochement avec l’historique', () => {
  it('retrouve une commande sans référence (réponse perdue), la crédite une seule fois ; ignore montant trop faible ou autre commande', async () => {
    store['balances/u9'] = {}; order('r1', { status: 'unknown', reference: null, merchantId: 'u9' }); delete store['fiat_refs/ref_r1'];
    order('r2', { status: 'unknown', reference: null, merchantId: 'u9' }); delete store['fiat_refs/ref_r2'];
    hist.rows = [{ reference: 'FP-1', status: 'SUCCESSFUL', amount: 13450, type: 'PAYMENT_API', customId: null, callbackId: 'r1' }, { reference: 'FP-2', status: 'SUCCESSFUL', amount: 100, type: 'PAYMENT_API', customId: null, callbackId: 'r2' }, { reference: 'FP-3', status: 'SUCCESSFUL', amount: 13450, type: 'PAYMENT_API', customId: null, callbackId: 'inconnu' }];
    status.next = { status: 'SUCCESSFUL', reference: 'FP-1', amount: 13450 };
    const r: any = await reconcileFiat(true); expect(r.linked).toBe(1);
    expect(store['fiat_orders/r1']).toMatchObject({ status: 'fulfilled', reference: 'FP-1' }); expect(store['balances/u9'].scarab_credit).toBe(20_000_000); expect(store['fiat_orders/r2'].status).toBe('unknown');
    await reconcileFiat(true); expect(store['balances/u9'].scarab_credit).toBe(20_000_000);
  });
  it('commande connue restée en attente alors que l’historique la montre réussie : revérifiée et créditée', async () => {
    store['balances/u8'] = {}; order('r3', { merchantId: 'u8' }); hist.rows = [{ reference: 'ref_r3', status: 'SUCCESSFUL', amount: 13450, type: 'PAYMENT_API', customId: null, callbackId: 'r3' }]; status.next = { status: 'SUCCESSFUL', reference: 'ref_r3', amount: 13450 };
    await reconcileFiat(true); expect(store['fiat_orders/r3'].status).toBe('fulfilled'); expect(store['balances/u8'].scarab_credit).toBe(20_000_000);
  });
  it('si le statut à la source n’est pas réussi, rien n’est crédité malgré l’historique', async () => {
    store['balances/u7'] = {}; order('r4', { merchantId: 'u7' }); hist.rows = [{ reference: 'ref_r4', status: 'SUCCESSFUL', amount: 13450, type: 'PAYMENT_API', customId: null, callbackId: 'r4' }]; status.next = { status: 'PENDING', reference: 'ref_r4', amount: null };
    await reconcileFiat(true); expect(store['fiat_orders/r4'].status).toBe('awaiting'); expect(store['balances/u7']).toEqual({});
  });
});
