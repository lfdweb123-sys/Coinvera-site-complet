import { beforeEach, describe, expect, it, vi } from 'vitest';
// Faux Firestore en mémoire (documents, requêtes simples, transactions) + faux eSIM Access : vérifie les écritures comptables et les cas d'échec de l'achat d'eSIM.
const { store, ref, coll } = vi.hoisted(() => {
  const store: Record<string, any> = {};
  const merge = (p: string, u: any) => { store[p] = { ...(store[p] ?? {}), ...u }; };
  const ref = (p: string): any => ({ path: p, id: p.split('/').pop(), get: async () => ({ exists: p in store, data: () => store[p] }), update: async (u: any) => merge(p, u), create: async (u: any) => { if (p in store) throw new Error('exists'); store[p] = u; } });
  const all = (c: string) => ({ get: async () => ({ empty: false, docs: Object.entries(store).filter(([k]) => k.startsWith(c + '/')).map(([k, d]) => ({ id: k.split('/').pop(), data: () => d })) }) });
  const coll = (c: string): any => ({ ...all(c), limit: () => all(c), doc: (id = 'a' + Math.random().toString(36).slice(2)) => ref(`${c}/${id}`),
    where: (f: string, _o: string, v: any) => { const q = { limit: () => q, get: async () => { const docs = Object.entries(store).filter(([k, d]) => k.startsWith(c + '/') && d?.[f] === v).map(([k, d]) => ({ id: k.split('/').pop(), data: () => d })); return { empty: !docs.length, docs }; } }; return q; } });
  return { store, ref, coll };
});
vi.mock('@/lib/firebase-admin', () => ({ db: { doc: ref, collection: coll, runTransaction: async (fn: any) => fn({ get: async (r: any) => r.get(), set: (r: any, u: any, o?: any) => { store[r.path] = o?.merge ? { ...store[r.path], ...u } : u; }, update: (r: any, u: any) => { store[r.path] = { ...store[r.path], ...u }; }, create: (r: any, u: any) => { if (r.path in store) throw new Error('exists'); store[r.path] = u; } }) } }));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'TS' } }));
vi.mock('@/lib/auth', () => ({ HttpError: class extends Error { constructor(public status: number, public code: string) { super(code); } } }));
vi.mock('@/lib/audit', () => ({ notify: async () => {} }));
vi.mock('@/lib/log', () => ({ info: () => {}, warn: () => {}, error: () => {} }));
import { adminAction, adminOverview, buyEsim, cancelOrder, handleEvent, listOrders, providerBalance, quote, reconcileOrdered, reconcileReview, reconcileStalled, refreshOrder, stateOf, topupEsim, topupOptions, view } from '@/lib/esim/orders';
import { _resetCatalog, _resetRules, chargeOf, costUnits, markup, normalize, searchPlans, summary } from '@/lib/esim/pricing';
import { gbLabel, norm } from '@/lib/esim/format';

type Handler = (path: string, body: any, headers: Record<string, string>) => [number, any] | 'throw';
let handler: Handler; const calls: string[] = [];
beforeEach(() => {
  _resetCatalog(); _resetRules(); for (const k of Object.keys(store)) delete store[k]; calls.length = 0;
  process.env.ESIMACCESS_ACCESS_CODE = 'ac'; delete process.env.ESIMACCESS_SECRET_KEY; process.env.ESIM_MARKUP_BPS = '3000'; process.env.ESIM_MARKUP_FLAT_USD = '0'; process.env.ESIM_PULL_DELAY_MS = '0';
  vi.stubGlobal('fetch', async (u: string, init: any) => { const path = new URL(String(u)).pathname.replace('/api/v1/open', ''); calls.push(path); const r = handler(path, JSON.parse(init.body), init.headers); if (r === 'throw') throw new Error('timeout'); return { status: r[0], json: async () => r[1] }; });
});
const ledgerNet = (m: string) => Object.values(store).filter((e: any) => e?.lines).flatMap((e: any) => e.lines).filter((l: any) => l.account.startsWith(`merchant:${m}:`)).reduce((a: number, l: any) => a + (l.dir === 'credit' ? l.amount : -l.amount), 0);
const poolSum = (m: string) => { const b = store[`balances/${m}`]; return (b.available ?? 0) + (b.esim_reserved ?? 0); };
const balanced = () => Object.values(store).filter((e: any) => e?.lines).every((e: any) => e.lines.reduce((a: number, l: any) => a + (l.dir === 'debit' ? l.amount : -l.amount), 0) === 0);
const seeded: Record<string, number> = {};
const seed = (m: string, usd: number) => { seeded[m] = usd * 1e6; store[`balances/${m}`] = { available: usd * 1e6 }; };
// Le solde de départ n'a pas d'écriture au registre : les mouvements du registre doivent égaler la variation des soldes (réconciliation).
const consistent = (m: string) => ledgerNet(m) === poolSum(m) - seeded[m];

const pkg = (o: Record<string, any> = {}) => ({ packageCode: 'CKH003', slug: 'JP_5_30', name: 'Japan 5GB 30Days', price: 15000, currencyCode: 'USD', volume: 5368709120, duration: 30, durationUnit: 'DAY', location: 'JP', dataType: 1, smsStatus: 0, activeType: 1, speed: '4G/5G', locationNetworkList: [{ locationName: 'Japan', operatorList: [{ operatorName: 'NTT Docomo', networkType: '4G' }] }], ...o });
const CHARGE = chargeOf(costUnits(15000));   // 1,50 USD + 30 % = 1,95 USD
const profile = (o: Record<string, any> = {}) => ({ esimTranNo: '26042216320015', orderNo: 'B26042216320015', transactionId: 'x', iccid: '8910300000059824319', ac: 'LPA:1$rsp-eu.redteamobile.com$451F9802E6854E3E85FB985235EDB4E5', qrCodeUrl: 'https://p.qrsim.net/a.png', smdpStatus: 'RELEASED', esimStatus: 'GOT_RESOURCE', totalVolume: 5368709120, orderUsage: 0, expiredTime: '2026-06-01T00:00:00+0000', apn: 'jp.apn', ...o });
const ok = (obj: any): [number, any] => [200, { success: true, errorCode: '0', errorMsg: null, obj }];
const err = (code: string): [number, any] => [200, { success: false, errorCode: code, errorMsg: 'x', obj: null }];
const dailyPkg = pkg({ packageCode: 'SG1D', slug: 'SG_1_Daily', name: 'Singapore 1GB/Day', location: 'SG', dataType: 2, volume: 1073741824, duration: 1, price: 3000, discountRuleCode: 'RULE', fupPolicy: '384 Kbps' });
const RULE = ok({ list: [{ discountRuleCode: 'RULE', rewardType: 20, periodRuleList: [{ minDays: 1, maxDays: 4, payRatio: 0.96 }, { minDays: 5, maxDays: 9, payRatio: 0.92 }, { minDays: 10, maxDays: 19, payRatio: 0.89 }], validPeriod: { startTime: '2024-12-27T00:00:00+0000', endTime: '2124-12-27T00:00:00+0000' } }] });
const TOPLIST = ok({ packageList: [pkg({ packageCode: 'TOPUP_CKH003', slug: 'TOPUP_JP_1_7', name: 'Japan 1GB 7Days', volume: 1073741824, duration: 7, price: 5000, location: '' })] });
const prov = (over: Partial<Record<string, [number, any] | 'throw'>> = {}): Handler => (path, body) => {
  if (path === '/package/list' && body?.type === 'TOPUP') return over.topList ?? TOPLIST;
  if (path === '/esim/topup') return over.topup ?? ok({});
  if (path === '/discountRule/list') return over.rule ?? RULE;
  if (path === '/balance/query') return ok({ balance: 940000 });
  if (path === '/esim/suspend' || path === '/esim/revoke' || path === '/esim/sendSms') return over.admin ?? [200, {}];
  if (path === '/package/list') return over.list ?? ok({ packageList: [pkg(), pkg({ packageCode: 'X1', slug: 'AS_1_7', name: 'Asia 11 countries 1GB 7 Days', location: 'JP,KR,TH,VN,ID', volume: 1073741824, duration: 7, price: 30000 })] });
  if (path === '/esim/order') return over.order ?? ok({ orderNo: 'B26042216320015', transactionId: 'x' });
  if (path === '/esim/query') return over.query ?? ok({ esimList: [profile()], pager: { total: 1 } });
  if (path === '/esim/cancel') return over.cancel ?? ok({});
  return [404, {}];
};

describe('prix', () => {
  it('convertit le prix du prestataire (10000 = 1 USD) en unités et ajoute la marge', () => { expect(costUnits(15000)).toBe(1_500_000); expect(CHARGE).toBe(1_950_000); });
  it('arrondit le prix de vente au cent supérieur', () => { expect(chargeOf(costUnits(12345))).toBe(1_610_000); });
  it('refuse un prix invalide', () => { expect(() => costUnits(0)).toThrow(); expect(() => costUnits('x')).toThrow(); });
  it('une marge nulle ou invalide ne vend jamais au prix coûtant', () => { process.env.ESIM_MARKUP_BPS = '0'; expect(markup().bps).toBe(3000); process.env.ESIM_MARKUP_BPS = 'abc'; expect(markup().bps).toBe(3000); });
});
describe('catalogue', () => {
  it('classe pays / régional / mondial et ignore les forfaits invalides ou « day pass »', () => {
    expect(normalize(pkg())).toMatchObject({ scope: 'country', title: 'Japon', chargeUnits: CHARGE });
    expect(normalize(pkg({ slug: 'AS', name: 'Asia 11 countries 1GB 30 Days', location: 'JP,KR,TH' }))).toMatchObject({ scope: 'regional', title: 'Asia 11 countries' });
    expect(normalize(pkg({ location: Array.from({ length: 70 }, (_, i) => 'A' + String.fromCharCode(65 + (i % 26)) + i).join(',') }))?.scope).toBe('global');
    expect(normalize(pkg({ dataType: 2 }))).toMatchObject({ daily: true, days: 1 }); expect(normalize(pkg({ dataType: 9 }))).toBeNull(); expect(normalize(pkg({ price: 0 }))).toBeNull(); expect(normalize(pkg({ slug: 'a b', packageCode: 'a b' }))).toBeNull();
  });
  it('recherche sans accents ni majuscules : la destination d’abord, puis les forfaits régionaux qui la couvrent', async () => {
    handler = prov(); const r = await searchPlans({ q: 'JAPON', page: 1, size: 20 });
    expect(r.items.map(x => x.id)).toEqual(['JP_5_30', 'AS_1_7']); expect(r.total).toBe(2);
    expect(JSON.stringify(r)).not.toMatch(/providerPrice|packageCode|CKH003/);
  });
  it('filtres : portée, région, volume, validité, tri', async () => {
    handler = prov();
    expect((await searchPlans({ scope: 'regional', page: 1, size: 20 })).items.map(x => x.id)).toEqual(['AS_1_7']);
    expect((await searchPlans({ region: 'asie', data: 'le1', page: 1, size: 20 })).items.map(x => x.id)).toEqual(['AS_1_7']);
    expect((await searchPlans({ days: 'le30', data: 'le5', page: 1, size: 20 })).items.map(x => x.id)).toEqual(['JP_5_30']);
    expect((await searchPlans({ sort: 'price_desc', page: 1, size: 20 })).items.map(x => x.id)).toEqual(['AS_1_7', 'JP_5_30']);
    expect((await searchPlans({ region: 'afrique', page: 1, size: 20 })).total).toBe(0);
  });
  it('résumé public : destinations avec prix « à partir de » et groupes régionaux', async () => {
    handler = prov(); const s = await summary();
    expect(s.destinations).toEqual([{ code: 'JP', name: 'Japon', region: 'asie', from: '1.950000', plans: 1, maxGb: '5 Go', daily: false }]); expect(s.groups[0]).toMatchObject({ name: 'Asia 11 countries', scope: 'regional', countries: 5 });
  });
  it('conserve le dernier catalogue connu si le prestataire tombe en panne', async () => {
    handler = prov(); await searchPlans({ page: 1, size: 5 }); handler = () => 'throw'; vi.useFakeTimers(); vi.setSystemTime(Date.now() + 11 * 60_000);
    try { expect((await searchPlans({ page: 1, size: 5 })).total).toBe(2); } finally { vi.useRealTimers(); }
  });
  it('formats', () => { expect(gbLabel(5368709120)).toBe('5 Go'); expect(gbLabel(536870912)).toBe('512 Mo'); expect(gbLabel(1610612736)).toBe('1,5 Go'); expect(norm('Côte d’Ivoire')).toBe('cote d ivoire'); });
});
describe('authentification du prestataire', () => {
  it('envoie le code d’accès, et une signature HMAC valide si une clé secrète est définie', async () => {
    let h: any; handler = (p, _b, hd) => { if (p === '/esim/order') h = hd; return prov()(p, _b, hd); };
    process.env.ESIMACCESS_SECRET_KEY = 'secret'; seed('u0', 5); await buyEsim('u0', { ref: 'ref00000000', slug: 'JP_5_30' });
    expect(h['RT-AccessCode']).toBe('ac'); const { createHmac } = await import('node:crypto');
    const body = JSON.stringify({ transactionId: store['esim_orders/u0_ref00000000'].txnId, amount: 15000, packageInfoList: [{ slug: 'JP_5_30', count: 1, price: 15000 }] });
    expect(h['RT-Signature']).toBe(createHmac('sha256', 'secret').update(h['RT-Timestamp'] + h['RT-RequestID'] + 'ac' + body).digest('hex'));
  });
});
describe('achat d’une eSIM', () => {
  it('succès : solde débité, réservation soldée, registre équilibré, marge enregistrée, eSIM livrée', async () => {
    handler = prov(); seed('u1', 5);
    const o = await buyEsim('u1', { ref: 'ref00000001', slug: 'JP_5_30' });
    expect(o).toMatchObject({ status: 'confirmed', state: 'ready', title: 'Japon', iccid: '8910300000059824319', smdp: 'rsp-eu.redteamobile.com', matchingId: '451F9802E6854E3E85FB985235EDB4E5', canCancel: true });
    const b = store['balances/u1']; expect(b.available).toBe(5e6 - CHARGE); expect(b.esim_reserved).toBe(0); expect(b.esim_spent).toBe(CHARGE); expect(consistent('u1')).toBe(true); expect(balanced()).toBe(true);
    expect(store['ledger_entries/es_done_u1_ref00000001'].lines.find((l: any) => l.account === 'platform:revenue').amount).toBe(CHARGE - 1_500_000);
    expect(JSON.stringify(o)).not.toMatch(/B26042216320015|26042216320015|esimTranNo|orderNo|txnId|providerPrice/);   // aucun identifiant prestataire côté navigateur
  });
  it('envoie le prix et le montant au prestataire avec un identifiant de transaction déterministe de 50 caractères au plus', async () => {
    let sent: any; handler = (p, b, h) => { if (p === '/esim/order') sent = b; return prov()(p, b, h); }; seed('u1', 5);
    await buyEsim('u1', { ref: 'ref00000001', slug: 'JP_5_30' }); expect(sent).toMatchObject({ amount: 15000, packageInfoList: [{ slug: 'JP_5_30', count: 1, price: 15000 }] }); expect(sent.transactionId).toMatch(/^cv[0-9a-f]{40}$/);
  });
  it('même référence (double clic) : une seule commande, un seul débit, un seul appel d’ordre', async () => {
    handler = prov(); seed('u1', 5); const a = await buyEsim('u1', { ref: 'ref00000001', slug: 'JP_5_30' }), b = await buyEsim('u1', { ref: 'ref00000001', slug: 'JP_5_30' });
    expect(a.id).toBe(b.id); expect(calls.filter(c => c === '/esim/order').length).toBe(1); expect(store['balances/u1'].available).toBe(5e6 - CHARGE);
  });
  it('solde insuffisant : refus sans appel d’ordre chez le prestataire', async () => {
    handler = prov(); seed('u2', 1); await expect(buyEsim('u2', { ref: 'ref00000002', slug: 'JP_5_30' })).rejects.toMatchObject({ code: 'insufficient_balance' });
    expect(calls.includes('/esim/order')).toBe(false); expect(store['balances/u2'].available).toBe(1e6);
  });
  it('prix supérieur à celui affiché : refus avant tout débit', async () => {
    handler = prov(); seed('u3', 5); await expect(buyEsim('u3', { ref: 'ref00000003', slug: 'JP_5_30', expected: CHARGE - 1 })).rejects.toMatchObject({ code: 'price_changed' });
    expect(store['balances/u3'].available).toBe(5e6); expect(Object.keys(store).some(k => k.startsWith('esim_orders/'))).toBe(false);
  });
  it('forfait disparu : refus avant tout débit', async () => {
    handler = prov({ list: ok({ packageList: [] }) }); seed('u3', 5); await expect(buyEsim('u3', { ref: 'ref00000003', slug: 'JP_5_30' })).rejects.toMatchObject({ code: 'package_unavailable' }); expect(store['balances/u3'].available).toBe(5e6);
  });
  it.each([['200007', 'service_unavailable'], ['200005', 'price_changed'], ['200011', 'no_stock'], ['310241', 'package_unavailable']])('refus définitif du prestataire (%s) : fonds rendus, aucune perte', async (code, mapped) => {
    handler = prov({ order: err(code) }); seed('u4', 5); const o = await buyEsim('u4', { ref: 'ref00000004', slug: 'JP_5_30' });
    expect(o).toMatchObject({ status: 'failed', state: 'failed', error: mapped }); expect(store['balances/u4'].available).toBe(5e6); expect(store['balances/u4'].esim_reserved).toBe(0); expect(consistent('u4')).toBe(true); expect(balanced()).toBe(true);
  });
  it('issue incertaine (délai dépassé) : fonds gardés réservés, état « vérification »', async () => {
    handler = prov({ order: 'throw' }); seed('u5', 5); const o = await buyEsim('u5', { ref: 'ref00000005', slug: 'JP_5_30' });
    expect(o).toMatchObject({ status: 'review', state: 'review' }); expect(store['balances/u5'].available).toBe(5e6 - CHARGE); expect(store['balances/u5'].esim_reserved).toBe(CHARGE);
  });
  it('« système occupé » (900001) est traité comme incertain, jamais comme un échec définitif', async () => {
    handler = prov({ order: err('900001') }); seed('u5', 5); expect((await buyEsim('u5', { ref: 'ref00000005', slug: 'JP_5_30' })).status).toBe('review'); expect(store['balances/u5'].esim_reserved).toBe(CHARGE);
  });
  it('profil pas encore alloué (200010) : fonds réservés, puis livraison à la relecture', async () => {
    handler = prov({ query: err('200010') }); seed('u6', 5); const o = await buyEsim('u6', { ref: 'ref00000006', slug: 'JP_5_30' });
    expect(o).toMatchObject({ status: 'ordered', state: 'preparing', iccid: null }); expect(store['balances/u6'].esim_reserved).toBe(CHARGE);
    handler = prov(); const r = await refreshOrder('u6', o.id); expect(r).toMatchObject({ status: 'confirmed', state: 'ready' }); expect(store['balances/u6'].esim_reserved).toBe(0); expect(consistent('u6')).toBe(true);
    handler = prov(); await refreshOrder('u6', o.id); expect(store['balances/u6'].esim_spent).toBe(CHARGE);   // relecture : jamais de second règlement
  });
  it('cron : un achat incertain dont la commande existe chez le prestataire est soldé et livré (jamais perdu)', async () => {
    handler = prov({ order: 'throw' }); seed('u7', 5); const o = await buyEsim('u7', { ref: 'ref00000007', slug: 'JP_5_30' });
    handler = prov({ query: ok({ esimList: [profile({ transactionId: store[`esim_orders/${o.id}`].txnId })] }) }); await reconcileReview(o.id);
    expect(store[`esim_orders/${o.id}`]).toMatchObject({ status: 'confirmed' }); expect(store['balances/u7'].esim_reserved).toBe(0); expect(store['balances/u7'].esim_spent).toBe(CHARGE); expect(consistent('u7')).toBe(true);
  });
  it('cron : introuvable avant le délai de grâce = on attend ; après = fonds rendus ; lecture impossible = on réessaie', async () => {
    handler = prov({ order: 'throw' }); seed('u8', 5); const o = await buyEsim('u8', { ref: 'ref00000008', slug: 'JP_5_30' });
    handler = prov({ query: ok({ esimList: [] }) }); await reconcileReview(o.id); expect(store[`esim_orders/${o.id}`].status).toBe('review');
    store[`esim_orders/${o.id}`].createdAtMs = Date.now() - 60 * 60_000; handler = prov({ query: err('000001') }); await reconcileReview(o.id); expect(store[`esim_orders/${o.id}`].status).toBe('review');   // erreur de lecture : jamais « introuvable » par défaut
    handler = prov({ query: ok({ esimList: [] }) }); await reconcileReview(o.id);
    expect(store[`esim_orders/${o.id}`].status).toBe('failed'); expect(store['balances/u8'].available).toBe(5e6); expect(consistent('u8')).toBe(true); expect(balanced()).toBe(true);
  });
  it('cron : une réservation restée sans appel passe en vérification', async () => {
    handler = prov(); seed('u9', 5); store['esim_orders/u9_ref00000009'] = { merchantId: 'u9', status: 'reserved', createdAtMs: Date.now() - 10 * 60_000 }; await reconcileStalled('u9_ref00000009'); expect(store['esim_orders/u9_ref00000009'].status).toBe('review');
  });
  it('cron : une commande acceptée inconnue du prestataire depuis longtemps est remboursée', async () => {
    handler = prov({ query: err('200010') }); seed('ua', 5); const o = await buyEsim('ua', { ref: 'ref0000000a', slug: 'JP_5_30' });
    store[`esim_orders/${o.id}`].orderedAtMs = Date.now() - 30 * 60_000; handler = prov({ query: err('310272') }); await reconcileOrdered(o.id);
    expect(store[`esim_orders/${o.id}`].status).toBe('failed'); expect(store['balances/ua'].available).toBe(5e6);
  });
});
describe('forfaits par jour (day pass)', () => {
  it('le catalogue propose le prix d’un jour ; le filtre « par jour » et la recherche fonctionnent', async () => {
    handler = prov({ list: ok({ packageList: [pkg(), dailyPkg] }) });
    const d = await searchPlans({ type: 'daily', page: 1, size: 5 }); expect(d.items).toHaveLength(1); expect(d.items[0]).toMatchObject({ id: 'SG_1_Daily', daily: true, gb: '1 Go/jour', daysLabel: '1 à 365 jours', price: '0.390000', fup: '384 Kbps' });
    expect((await searchPlans({ type: 'fixed', page: 1, size: 5 })).items.map(x => x.id)).toEqual(['JP_5_30']); expect((await searchPlans({ days: 'le7', page: 1, size: 5 })).total).toBe(0);
    expect((await summary()).destinations.map(x => [x.code, x.daily])).toEqual([['JP', false]]);   // « dès X » ne mélange jamais prix par jour et prix de forfait
  });
  it('achat de 10 jours : remise du palier, périodNum envoyé sans prix, total exact débité', async () => {
    let sent: any; handler = (p, b, h) => { if (p === '/esim/order') sent = b; return prov({ list: ok({ packageList: [dailyPkg] }) })(p, b, h); }; seed('d1', 9);
    const o = await buyEsim('d1', { ref: 'ref000000d1', slug: 'SG_1_Daily', days: 10 });
    expect(sent.packageInfoList).toEqual([{ slug: 'SG_1_Daily', count: 1, periodNum: 10 }]); expect(sent.amount).toBeUndefined();
    expect(o).toMatchObject({ status: 'confirmed', daily: true, days: 10, total: '3.480000', gb: '1 Go/jour' }); expect(store['balances/d1'].available).toBe(9e6 - 3_480_000); expect(consistent('d1')).toBe(true); expect(balanced()).toBe(true);
  });
  it('durée invalide : refus avant tout débit', async () => {
    handler = prov({ list: ok({ packageList: [dailyPkg] }) }); seed('d2', 9);
    for (const [i, days] of [0, 366, 1.5, undefined].entries()) await expect(buyEsim('d2', { ref: 'ref00000d2x' + i, slug: 'SG_1_Daily', days: days as any })).rejects.toMatchObject({ code: 'invalid_period' });
    expect(store['balances/d2'].available).toBe(9e6); expect(calls.includes('/esim/order')).toBe(false);
  });
  it('cotation : même total que celui facturé ; prix supérieur à l’affiché refusé', async () => {
    handler = prov({ list: ok({ packageList: [dailyPkg] }) }); seed('d3', 9);
    expect(await quote('d3', { slug: 'SG_1_Daily', days: 3 })).toMatchObject({ price: '1.130000', days: 3, ratio: 0.96, daily: true, perDay: '0.390000' });   // 0,30 x 3 x 0,96 = 0,864 -> +30 % -> 1,1232 -> 1,13
    await expect(buyEsim('d3', { ref: 'ref000000d3', slug: 'SG_1_Daily', days: 3, expected: 1_120_000 })).rejects.toMatchObject({ code: 'price_changed' }); expect(store['balances/d3'].available).toBe(9e6);
  });
  it('sans règle de remise connue, le prix journalier plein s’applique (jamais moins cher)', async () => {
    handler = prov({ list: ok({ packageList: [dailyPkg] }), rule: err('999') }); expect((await quote('d4', { slug: 'SG_1_Daily', days: 10 })).ratio).toBe(1);
  });
});
describe('recharge (top-up)', () => {
  const profileUp = (o: Record<string, any> = {}) => ok({ esimList: [profile({ totalVolume: 6442450944, expiredTime: '2026-06-08T00:00:00+0000', ...o })] });
  const bought = async (u: string, r: string) => { handler = prov(); seed(u, 9); return buyEsim(u, { ref: r, slug: 'JP_5_30' }); };
  const TOP = chargeOf(costUnits(5000));
  it('propose les recharges de l’eSIM, recharge, règle, relit le profil et empêche ensuite l’annulation', async () => {
    const o = await bought('t1', 'ref000000t1'); expect(o).toMatchObject({ canTopup: true, canCancel: true });
    const opts = await topupOptions('t1', o.id); expect(opts.items).toEqual([expect.objectContaining({ id: 'TOPUP_JP_1_7', gb: '1 Go', price: fromTop(TOP) })]);
    let sent: any; handler = (p, b, h) => { if (p === '/esim/topup') sent = b; return p === '/esim/query' ? profileUp() : prov()(p, b, h); };
    const r = await topupEsim('t1', o.id, { ref: 'ref00000top1', slug: 'TOPUP_JP_1_7', expected: TOP });
    expect(sent).toMatchObject({ esimTranNo: '26042216320015', packageCode: 'TOPUP_JP_1_7', amount: 5000 }); expect(sent.transactionId).toMatch(/^cv[0-9a-f]{40}$/); expect(sent.periodNum).toBeUndefined();
    expect(r).toMatchObject({ topups: 1, canCancel: false }); expect(r.usage?.total).toBe(6442450944); expect(store['balances/t1'].available).toBe(9e6 - CHARGE - TOP); expect(store['balances/t1'].esim_reserved).toBe(0); expect(consistent('t1')).toBe(true); expect(balanced()).toBe(true);
    await expect(cancelOrder('t1', o.id)).rejects.toMatchObject({ code: 'cancel_rejected' });
    const l = await listOrders('t1', { page: 1, size: 10 }); expect(l.total).toBe(1); expect(l.stats.spent).toBe(fromTop(CHARGE + TOP));   // la recharge n’apparaît pas comme une eSIM, mais compte dans le total dépensé
  });
  it('même référence : une seule recharge, un seul débit', async () => {
    const o = await bought('t2', 'ref000000t2'); handler = (p, b, h) => p === '/esim/query' ? profileUp() : prov()(p, b, h);
    await topupEsim('t2', o.id, { ref: 'ref00000top2', slug: 'TOPUP_JP_1_7' }); await topupEsim('t2', o.id, { ref: 'ref00000top2', slug: 'TOPUP_JP_1_7' });
    expect(calls.filter(c => c === '/esim/topup').length).toBe(1); expect(store['balances/t2'].available).toBe(9e6 - CHARGE - TOP);
  });
  it('refus définitif du prestataire : fonds rendus', async () => {
    const o = await bought('t3', 'ref000000t3'); handler = prov({ topup: err('200007') }); await topupEsim('t3', o.id, { ref: 'ref00000top3', slug: 'TOPUP_JP_1_7' });
    expect(store['balances/t3'].available).toBe(9e6 - CHARGE); expect(store['balances/t3'].esim_reserved).toBe(0); expect(consistent('t3')).toBe(true);
  });
  it('recharge d’un forfait par jour : périodNum, remise de palier, pas de prix envoyé', async () => {
    handler = prov({ list: ok({ packageList: [dailyPkg] }) }); seed('t4', 30); const o = await buyEsim('t4', { ref: 'ref000000t4', slug: 'SG_1_Daily', days: 5 });
    let sent: any; handler = (p, b, h) => { if (p === '/esim/topup') sent = b; return p === '/package/list' && b.type === 'TOPUP' ? ok({ packageList: [dailyPkg] }) : p === '/esim/query' ? profileUp() : prov()(p, b, h); };
    await topupEsim('t4', o.id, { ref: 'ref00000top4', slug: 'SG_1_Daily', days: 20 });   // 20 jours : pas de palier connu dans la règle de test -> prix plein
    expect(sent).toMatchObject({ packageCode: 'SG_1_Daily', periodNum: 20 }); expect(sent.amount).toBeUndefined(); expect(consistent('t4')).toBe(true);
  });
  it('issue incertaine : fonds gardés, une seule recharge à la fois ; le cron tranche (appliquée ou rendue)', async () => {
    const o = await bought('t5', 'ref000000t5'); handler = prov({ topup: 'throw' }); await topupEsim('t5', o.id, { ref: 'ref00000top5', slug: 'TOPUP_JP_1_7' });
    const id = 't5_ref00000top5'; expect(store[`esim_orders/${id}`].status).toBe('review'); expect(store['balances/t5'].esim_reserved).toBe(TOP);
    await expect(topupEsim('t5', o.id, { ref: 'ref00000top6', slug: 'TOPUP_JP_1_7' })).rejects.toMatchObject({ code: 'order_state' });
    handler = prov(); await reconcileReview(id); expect(store[`esim_orders/${id}`].status).toBe('review');                  // rien n’a changé chez le prestataire : on attend
    handler = (p, b, h) => p === '/esim/query' ? profileUp() : prov()(p, b, h); await reconcileReview(id); expect(store[`esim_orders/${id}`].status).toBe('confirmed'); expect(store['balances/t5'].esim_reserved).toBe(0); expect(consistent('t5')).toBe(true);
  });
  it('issue incertaine sans effet après le délai de grâce : fonds rendus', async () => {
    const o = await bought('t6', 'ref000000t6'); handler = prov({ topup: 'throw' }); await topupEsim('t6', o.id, { ref: 'ref00000top7', slug: 'TOPUP_JP_1_7' });
    const id = 't6_ref00000top7'; store[`esim_orders/${id}`].createdAtMs = Date.now() - 60 * 60_000; handler = prov(); await reconcileReview(id);
    expect(store[`esim_orders/${id}`].status).toBe('failed'); expect(store['balances/t6'].available).toBe(9e6 - CHARGE); expect(consistent('t6')).toBe(true);
  });
  it('recharge refusée : eSIM expirée, autre utilisateur, recharge inconnue, solde insuffisant', async () => {
    const o = await bought('t7', 'ref000000t7'); await expect(topupEsim('autre', o.id, { ref: 'ref00000top8', slug: 'TOPUP_JP_1_7' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(topupEsim('t7', o.id, { ref: 'ref00000top9', slug: 'TOPUP_X' })).rejects.toMatchObject({ code: 'topup_unavailable' });
    store['balances/t7'].available = 1; await expect(topupEsim('t7', o.id, { ref: 'ref0000top10', slug: 'TOPUP_JP_1_7' })).rejects.toMatchObject({ code: 'insufficient_balance' });
    store[`esim_orders/${o.id}`].esim.esimStatus = 'USED_EXPIRED'; await expect(topupOptions('t7', o.id)).rejects.toMatchObject({ code: 'order_state' });
  });
});
const fromTop = (u: number) => (u / 1e6).toFixed(6);
describe('actions exploitant', () => {
  const bought = async (u: string, r: string) => { handler = prov(); seed(u, 5); return buyEsim(u, { ref: r, slug: 'JP_5_30' }); };
  it('suspendre / réactiver / révoquer / SMS : un 200 sans corps est un succès, le statut est relu à la source', async () => {
    const o = await bought('a1', 'ref000000a1'); handler = (p, b, h) => p === '/esim/query' ? ok({ esimList: [profile({ esimStatus: 'SUSPENDED' })] }) : prov()(p, b, h);
    expect(await adminAction(o.id, 'suspend')).toMatchObject({ state: 'suspended' }); await adminAction(o.id, 'sms', 'Bonjour'); expect(calls.includes('/esim/sendSms')).toBe(true);
    await expect(adminAction(o.id, 'sms', '')).rejects.toMatchObject({ code: 'invalid_request' }); await expect(adminAction(o.id, 'sms', 'x'.repeat(501))).rejects.toMatchObject({ code: 'invalid_request' });
    handler = (p, b, h) => p === '/esim/query' ? ok({ esimList: [profile({ esimStatus: 'REVOKED' })] }) : prov()(p, b, h); expect(await adminAction(o.id, 'revoke')).toMatchObject({ state: 'revoked' }); expect(store['balances/a1'].available).toBe(5e6 - CHARGE);   // révoquer ne rembourse pas
  });
  it('erreur du prestataire signalée ; commande inconnue refusée', async () => {
    const o = await bought('a2', 'ref000000a2'); handler = prov({ admin: err('200002') }); await expect(adminAction(o.id, 'suspend')).rejects.toMatchObject({ code: 'cancel_rejected' }); await expect(adminAction('nope', 'suspend')).rejects.toMatchObject({ code: 'not_found' });
  });
  it('solde revendeur et vue d’ensemble', async () => {
    const o = await bought('a3', 'ref000000a3'); expect(await providerBalance()).toBe('94.000000'); const v = await adminOverview(); expect(v.counts.ready).toBe(1); expect(v.recent[0]).toMatchObject({ id: o.id, merchantId: 'a3', manageable: true, charge: '1.950000', cost: '1.500000' });
  });
});
describe('annulation', () => {
  const bought = async (u: string, r: string) => { handler = prov(); seed(u, 5); return buyEsim(u, { ref: r, slug: 'JP_5_30' }); };
  it('eSIM jamais installée : annulation acceptée, remboursement intégral (marge comprise), une seule fois', async () => {
    const o = await bought('c1', 'ref000000c1'); const c = await cancelOrder('c1', o.id);
    expect(c).toMatchObject({ refunded: true, state: 'refunded', canCancel: false }); expect(store['balances/c1'].available).toBe(5e6); expect(store['balances/c1'].esim_spent).toBe(0); expect(consistent('c1')).toBe(true); expect(balanced()).toBe(true);
    await expect(cancelOrder('c1', o.id)).rejects.toMatchObject({ code: 'order_state' }); expect(store['balances/c1'].available).toBe(5e6);
  });
  it('eSIM déjà installée : annulation refusée sans appel au prestataire, aucun remboursement', async () => {
    const o = await bought('c2', 'ref000000c2'); handler = prov({ query: ok({ esimList: [profile({ smdpStatus: 'ENABLED', esimStatus: 'IN_USE' })] }) });
    await expect(cancelOrder('c2', o.id)).rejects.toMatchObject({ code: 'cancel_rejected' }); expect(calls.includes('/esim/cancel')).toBe(false); expect(store['balances/c2'].available).toBe(5e6 - CHARGE);
  });
  it('refus du prestataire (200002) : pas de remboursement', async () => {
    const o = await bought('c3', 'ref000000c3'); handler = prov({ cancel: err('200002') }); await expect(cancelOrder('c3', o.id)).rejects.toMatchObject({ code: 'cancel_rejected' }); expect(store['balances/c3'].available).toBe(5e6 - CHARGE);
  });
  it('délai dépassé pendant l’annulation : relecture à la source, remboursée seulement si le prestataire a bien annulé', async () => {
    let o = await bought('c4', 'ref000000c4'); handler = prov({ cancel: 'throw' }); await expect(cancelOrder('c4', o.id)).rejects.toMatchObject({ code: 'provider_unreachable' }); expect(store['balances/c4'].available).toBe(5e6 - CHARGE);
    let n = 0; handler = (p, b, h) => p === '/esim/cancel' ? 'throw' : p === '/esim/query' ? ok({ esimList: [profile(n++ >= 1 ? { esimStatus: 'CANCEL' } : {})] }) : prov()(p, b, h);   // annulée malgré le délai dépassé
    const c = await cancelOrder('c4', o.id); expect(c.refunded).toBe(true); expect(store['balances/c4'].available).toBe(5e6); expect(consistent('c4')).toBe(true);
  });
  it('annulée chez le prestataire par ailleurs : la relecture rembourse', async () => {
    const o = await bought('c5', 'ref000000c5'); handler = prov({ query: ok({ esimList: [profile({ esimStatus: 'CANCEL' })] }) }); store[`esim_orders/${o.id}`].checkedMs = 0;
    expect((await refreshOrder('c5', o.id)).refunded).toBe(true); expect(store['balances/c5'].available).toBe(5e6);
  });
  it('une eSIM qui n’est pas la sienne est introuvable', async () => { const o = await bought('c6', 'ref000000c6'); await expect(refreshOrder('autre', o.id)).rejects.toMatchObject({ code: 'not_found' }); await expect(cancelOrder('autre', o.id)).rejects.toMatchObject({ code: 'not_found' }); });
});
describe('états, liste et webhooks', () => {
  const base = { status: 'confirmed', refunded: false };
  it('états affichés', () => {
    expect(stateOf({ status: 'reserved' })).toBe('preparing'); expect(stateOf({ ...base, esim: { esimStatus: 'GOT_RESOURCE', smdpStatus: 'RELEASED' } })).toBe('ready');
    expect(stateOf({ ...base, esim: { esimStatus: 'GOT_RESOURCE', smdpStatus: 'INSTALLATION' } })).toBe('installed'); expect(stateOf({ ...base, esim: { esimStatus: 'IN_USE', smdpStatus: 'ENABLED' } })).toBe('active');
    expect(stateOf({ ...base, esim: { esimStatus: 'USED_UP' } })).toBe('depleted'); expect(stateOf({ ...base, esim: { esimStatus: 'USED_EXPIRED' } })).toBe('expired'); expect(stateOf({ ...base, refunded: true, esim: {} })).toBe('refunded');
  });
  it('la liste ne contient jamais le code d’activation ; filtres et recherche', async () => {
    handler = prov(); seed('l1', 9); await buyEsim('l1', { ref: 'ref000000l1', slug: 'JP_5_30' }); await buyEsim('l1', { ref: 'ref000000l2', slug: 'AS_1_7' });
    const all = await listOrders('l1', { page: 1, size: 10 }); expect(all.total).toBe(2); expect(all.stats).toMatchObject({ total: 2, active: 2 }); expect(JSON.stringify(all)).not.toMatch(/LPA:1|451F9802|"ac"/);
    expect((await listOrders('l1', { page: 1, size: 10, q: 'japon' })).items.map(x => x.title).sort()).toEqual(['Asia 11 countries', 'Japon']); expect((await listOrders('l1', { page: 1, size: 10, q: '8910300000059824319' })).total).toBe(2); expect((await listOrders('l1', { page: 1, size: 10, state: 'active' })).total).toBe(0);
    expect((await listOrders('autre', { page: 1, size: 10 })).total).toBe(0);
  });
  it('webhook ORDER_STATUS : sert de signal, la commande est relue chez le prestataire', async () => {
    handler = prov({ query: err('200010') }); seed('w1', 5); const o = await buyEsim('w1', { ref: 'ref000000w1', slug: 'JP_5_30' }); expect(o.status).toBe('ordered');
    handler = prov(); expect(await handleEvent('ORDER_STATUS', { orderNo: 'B26042216320015', orderStatus: 'GOT_RESOURCE' }, 'notify0001')).toBe('synced'); expect(store[`esim_orders/${o.id}`].status).toBe('confirmed');
    expect(await handleEvent('ORDER_STATUS', { orderNo: 'B99999999999999' }, 'notify0002')).toBe('unknown_order'); expect(await handleEvent('SMDP_EVENT', { orderNo: 'B26042216320015' }, 'notify0003')).toBe('ignored'); expect(await handleEvent('ORDER_STATUS', { orderNo: "x'; drop" }, 'n')).toBe('unknown_order');
  });
  it('webhook DATA_USAGE : prévient une seule fois quand il reste moins de 10 %', async () => {
    handler = prov(); seed('w2', 5); await buyEsim('w2', { ref: 'ref000000w2', slug: 'JP_5_30' }); const c = { orderNo: 'B26042216320015', remainThreshold: 0.1 };
    expect(await handleEvent('DATA_USAGE', c, 'notify0010')).toBe('notified'); expect(await handleEvent('DATA_USAGE', c, 'notify0010')).toBe('duplicate'); expect(await handleEvent('DATA_USAGE', { ...c, remainThreshold: 0.5 }, 'notify0011')).toBe('ignored');
  });
  it('vue : un détail porte le code d’activation, pas une liste', () => { const o = { status: 'confirmed', title: 'T', bytes: 1, days: 1, chargeUnits: 1, esim: { ac: 'LPA:1$h$m', iccid: 'i' } }; expect(view('i', o)).toMatchObject({ ac: 'LPA:1$h$m', smdp: 'h', matchingId: 'm' }); expect(view('i', o, false)).not.toHaveProperty('ac'); });
});
