import { beforeEach, describe, expect, it, vi } from 'vitest';
// Faux Firestore en mémoire (documents, requêtes simples, transactions) + faux ProxNum : vérifie les écritures comptables et les cas d'échec de l'achat de numéros virtuels.
const { store, ref, coll } = vi.hoisted(() => {
  const store: Record<string, any> = {};
  const merge = (p: string, u: any) => { const cur = { ...(store[p] ?? {}) }; for (const [k, v] of Object.entries(u)) cur[k] = v && typeof (v as any).__union !== 'undefined' ? [...(cur[k] ?? []), ...(v as any).__union] : v; store[p] = cur; };
  const ref = (p: string): any => ({ path: p, id: p.split('/').pop(), get: async () => ({ exists: p in store, data: () => store[p] }), update: async (u: any) => merge(p, u) });
  const coll = (c: string): any => ({ doc: (id = 'a' + Math.random().toString(36).slice(2)) => ref(`${c}/${id}`),
    where: (f: string, _o: string, v: any) => { const q = { limit: () => q, get: async () => { const docs = Object.entries(store).filter(([k, d]) => k.startsWith(c + '/') && d?.[f] === v).map(([k, d]) => ({ id: k.split('/').pop(), data: () => d })); return { empty: !docs.length, docs }; } }; return q; } });
  return { store, ref, coll };
});
vi.mock('@/lib/firebase-admin', () => ({ db: { doc: ref, collection: coll, runTransaction: async (fn: any) => fn({ get: async (r: any) => r.get(), set: (r: any, u: any, o?: any) => { store[r.path] = o?.merge ? { ...store[r.path], ...u } : u; }, update: (r: any, u: any) => { store[r.path] = { ...store[r.path], ...u }; }, create: (r: any, u: any) => { if (r.path in store) throw new Error('exists'); store[r.path] = u; } }) } }));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'TS', arrayUnion: (...a: any[]) => ({ __union: a }) } }));
vi.mock('@/lib/auth', () => ({ HttpError: class extends Error { constructor(public status: number, public code: string) { super(code); } } }));
vi.mock('@/lib/audit', () => ({ notify: async () => {} }));
vi.mock('@/lib/log', () => ({ info: () => {}, warn: () => {}, error: () => {} }));
import { buyRental, buyVirtual, cancelOrder, reconcileReview, reconcilePendingCancel, refreshOrder } from '@/lib/proxnum/orders';
import { chargeOf, costUnits, rentalCatalog, virtualCountries, virtualServices } from '@/lib/proxnum/pricing';

type Handler = (url: URL, init: any) => [number, any] | 'throw';
let handler: Handler; const calls: string[] = [];
beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k]; calls.length = 0; process.env.PROXNUM_API_KEY = 'k'; process.env.PROXNUM_MARKUP_BPS = '20000'; process.env.PROXNUM_MARKUP_FLAT_USD = '0';
  vi.stubGlobal('fetch', async (u: URL, init: any) => { const url = new URL(String(u)); calls.push(`${init.method} ${url.pathname}`); const r = handler(url, init); if (r === 'throw') throw new Error('timeout'); return { status: r[0], json: async () => r[1] }; });
});
const ledgerNet = (m: string) => Object.values(store).filter((e: any) => e?.lines).flatMap((e: any) => e.lines).filter((l: any) => l.account.startsWith(`merchant:${m}:`)).reduce((a: number, l: any) => a + (l.dir === 'credit' ? l.amount : -l.amount), 0);
const poolSum = (m: string) => { const b = store[`balances/${m}`]; return (b.available ?? 0) + (b.proxnum_reserved ?? 0); };
const balanced = () => Object.values(store).filter((e: any) => e?.lines).every((e: any) => e.lines.reduce((a: number, l: any) => a + (l.dir === 'debit' ? l.amount : -l.amount), 0) === 0);
const seeded: Record<string, number> = {};
const seed = (m: string, usd: number) => { seeded[m] = usd * 1e6; store[`balances/${m}`] = { available: usd * 1e6 }; };
// Le solde de départ n'a pas d'écriture au registre : les mouvements du registre doivent égaler la variation des soldes (réconciliation).
const consistent = (m: string) => ledgerNet(m) === poolSum(m) - seeded[m];
const CHARGE = chargeOf(costUnits(0.1114892));
const price = { country: '6', service: 'ig', base_price: 0.0334, sell_price: 0.1114892 };
const buyOk = [200, { success: true, activation: { id: 737, phone: '62895406203932', activation_id: '4390520873', msg: 'Waiting Sms', amount_paid: 0.111489, status: 1 } }] as [number, any];
const virt = (over: Partial<Record<string, [number, any] | 'throw'>> = {}): Handler => (u, init) => {
  if (u.pathname.endsWith('/resell/price')) return [200, price]; if (u.pathname.endsWith('/virtual/buy')) return over.buy ?? buyOk; if (u.pathname.endsWith('/virtual/cancel')) return over.cancel ?? [200, { success: true, code: 'cancel_accepted' }];
  if (u.pathname.includes('/status')) return over.status ?? [200, { success: true, status: 'completed', code: '1234' }]; if (u.pathname.endsWith('/activations')) return over.list ?? [200, { data: [] }]; return [404, {}];
};

describe('prix', () => {
  it('arrondit le coût au-dessus et ajoute la marge', () => { expect(costUnits(0.1114892)).toBe(111490); expect(chargeOf(111490)).toBe(111490 * 3);   });
  it('refuse un prix invalide', () => { expect(() => costUnits(0)).toThrow(); expect(() => costUnits('x')).toThrow(); });
});
describe('achat d’un numéro virtuel', () => {
  it('succès : solde débité, réservation soldée, registre équilibré, marge enregistrée', async () => {
    handler = virt(); seed('u1', 5);
    const o = await buyVirtual('u1', { ref: 'ref00000001', service: 'ig', country: 6 });
    expect(o).toMatchObject({ status: 'confirmed', phone: '62895406203932' });
    const b = store['balances/u1']; const charge = chargeOf(costUnits(0.1114892));
    expect(b.available).toBe(5e6 - charge); expect(b.proxnum_reserved).toBe(0); expect(consistent('u1')).toBe(true); expect(balanced()).toBe(true);
    const done = store['ledger_entries/px_done_u1_ref00000001']; expect(done.lines.find((l: any) => l.account === 'platform:revenue').amount).toBe(charge - 111489);   // coût réel facturé par ProxNum (amount_paid) ; l'écart est la marge
    expect(JSON.stringify(o)).not.toMatch(/activationId|priceToken|4390520873/);   // aucun identifiant prestataire côté navigateur
  });
  it('solde insuffisant : refus sans appel d’achat chez ProxNum', async () => {
    handler = virt(); seed('u2', 0.05);
    await expect(buyVirtual('u2', { ref: 'ref00000002', service: 'ig', country: 6 })).rejects.toMatchObject({ code: 'insufficient_balance' });
    expect(calls.some(c => c.includes('/virtual/buy'))).toBe(false); expect(store['balances/u2'].available).toBe(50_000);
  });
  it('prix supérieur à celui affiché : refus avant tout débit', async () => {
    handler = virt(); seed('u3', 5);
    await expect(buyVirtual('u3', { ref: 'ref00000003', service: 'ig', country: 6, expected: 100 })).rejects.toMatchObject({ code: 'price_changed' });
    expect(store['balances/u3'].available).toBe(5e6);
  });
  it('aucun numéro : fonds remis, registre équilibré', async () => {
    handler = virt({ buy: [409, { success: false, code: 'no_numbers', message: 'x' }] }); seed('u4', 5);
    const o = await buyVirtual('u4', { ref: 'ref00000004', service: 'ig', country: 6 });
    expect(o).toMatchObject({ status: 'failed', error: 'no_numbers' }); expect(store['balances/u4']).toMatchObject({ available: 5e6, proxnum_reserved: 0 }); expect(balanced()).toBe(true);
  });
  it('solde revendeur vide chez ProxNum : l’utilisateur voit « service indisponible » et récupère ses fonds', async () => {
    handler = virt({ buy: [402, { success: false, code: 'insufficient_balance' }] }); seed('u5', 5);
    expect(await buyVirtual('u5', { ref: 'ref00000005', service: 'ig', country: 6 })).toMatchObject({ status: 'failed', error: 'service_unavailable' }); expect(store['balances/u5'].available).toBe(5e6);
  });
  it('même référence = une seule commande et un seul achat (double clic)', async () => {
    handler = virt(); seed('u6', 5);
    await buyVirtual('u6', { ref: 'ref00000006', service: 'ig', country: 6 }); await buyVirtual('u6', { ref: 'ref00000006', service: 'ig', country: 6 });
    expect(calls.filter(c => c.includes('/virtual/buy')).length).toBe(1); expect(store['balances/u6'].available).toBe(5e6 - CHARGE);
  });
  it('issue incertaine (délai dépassé) : fonds gardés en réservation, puis rendus seulement si rien n’a été débité', async () => {
    handler = virt({ buy: 'throw' }); seed('u7', 5);
    const o = await buyVirtual('u7', { ref: 'ref00000007', service: 'ig', country: 6 }); expect(o.status).toBe('review');
    expect(store['balances/u7'].proxnum_reserved).toBe(CHARGE);
    handler = virt(); await reconcileReview('u7_ref00000007'); expect(store['proxnum_orders/u7_ref00000007'].status).toBe('review');    // trop tôt : on attend
    store['proxnum_orders/u7_ref00000007'].createdAtMs -= 31 * 60_000; await reconcileReview('u7_ref00000007');
    expect(store['proxnum_orders/u7_ref00000007'].status).toBe('failed'); expect(store['balances/u7']).toMatchObject({ available: 5e6, proxnum_reserved: 0 }); expect(balanced()).toBe(true);
  });
  it('issue incertaine mais achat retrouvé chez ProxNum : jamais rendu ni attribué automatiquement', async () => {
    handler = virt({ buy: 'throw' }); seed('u8', 5); await buyVirtual('u8', { ref: 'ref00000008', service: 'ig', country: 6 });
    store['proxnum_orders/u8_ref00000008'].createdAtMs -= 31 * 60_000; handler = virt({ list: [200, { data: [{ activation_id: '777', amount_paid: 0.111489 }] }] });
    await reconcileReview('u8_ref00000008'); expect(store['proxnum_orders/u8_ref00000008'].status).toBe('review'); expect(store['balances/u8'].proxnum_reserved).toBe(CHARGE);
  });
});
describe('code SMS, annulation et remboursement', () => {
  it('lit le code, puis refuse l’annulation une fois le SMS reçu', async () => {
    handler = virt(); seed('u9', 5); const o = await buyVirtual('u9', { ref: 'ref00000009', service: 'ig', country: 6 });
    expect((await refreshOrder('u9', o.id)).code).toBe('1234'); await expect(cancelOrder('u9', o.id)).rejects.toMatchObject({ code: 'cancel_rejected' });
  });
  it('annulation acceptée : remboursement intégral, une seule fois, registre équilibré', async () => {
    handler = virt(); seed('u10', 5); const o = await buyVirtual('u10', { ref: 'ref00000010', service: 'ig', country: 6 });
    await cancelOrder('u10', o.id); expect(store['balances/u10'].available).toBe(5e6); expect(store['proxnum_orders/' + o.id].refunded).toBe(true);
    await expect(cancelOrder('u10', o.id)).rejects.toMatchObject({ code: 'order_state' }); expect(store['balances/u10'].available).toBe(5e6); expect(consistent('u10')).toBe(true); expect(balanced()).toBe(true);
  });
  it('annulation rejetée par ProxNum : aucun remboursement', async () => {
    handler = virt({ cancel: [200, { success: false, code: 'cancel_rejected' }] }); seed('u11', 5); const o = await buyVirtual('u11', { ref: 'ref00000011', service: 'ig', country: 6 });
    await expect(cancelOrder('u11', o.id)).rejects.toMatchObject({ code: 'cancel_rejected' }); expect(store['balances/u11'].available).toBe(5e6 - CHARGE);
  });
  it('une commande d’un autre utilisateur est introuvable', async () => {
    handler = virt(); seed('u12', 5); const o = await buyVirtual('u12', { ref: 'ref00000012', service: 'ig', country: 6 });
    await expect(refreshOrder('intrus', o.id)).rejects.toMatchObject({ code: 'not_found' });
  });
});
describe('location', () => {
  const cat = { ok: true, country: '187', hours: 168, durations: [{ hours: 24, label: '1 day' }, { hours: 168, label: '1 week' }], countries: [{ id: '187', name: 'USA' }], services: [{ code: 'wa', name: 'WhatsApp', price: 4.2, stock: 35 }], cancel_window_seconds: 120 };
  const rent = (over: Partial<Record<string, [number, any]>> = {}): Handler => u => {
    if (u.pathname.endsWith('/rental/catalog')) return [200, cat]; if (u.pathname.endsWith('/rental/buy')) return over.buy ?? [200, { ok: true, rental: { id: 512, phone: '14155550123', status: 'active', amount_paid: 4.2, expires_at: '2026-10-10T12:00:00+03:00', can_cancel: true, can_extend: true } }];
    if (u.pathname.endsWith('/rental/cancel')) return over.cancel ?? [202, { ok: true, pending: true }]; if (u.pathname.endsWith('/status')) return over.status ?? [200, { ok: true, rental: { status: 'active', expires_at: '2026-10-10T12:00:00+03:00', can_cancel: true, can_extend: true, messages: [{ sender: 'WhatsApp', text: 'Your code: 123-456', code: '123456', date: 'd' }] } }]; return [404, {}];
  };
  it('achat : max_price envoyé, durée validée, solde débité', async () => {
    let sent: any; handler = (u, i) => { if (u.pathname.endsWith('/rental/buy')) sent = JSON.parse(i.body); return rent()(u, i) as any; }; seed('r1', 20);
    const o = await buyRental('r1', { ref: 'rental000001', service: 'wa', country: 187, hours: 168 }); expect(o).toMatchObject({ status: 'confirmed', phone: '14155550123', hours: 168 }); expect(sent).toMatchObject({ service: 'wa', country: 187, hours: 168, max_price: 4.2 });
    expect(store['balances/r1'].available).toBe(20e6 - chargeOf(4_200_000)); expect(balanced()).toBe(true);
    await expect(buyRental('r1', { ref: 'rental000002', service: 'wa', country: 187, hours: 5 })).rejects.toMatchObject({ code: 'invalid_period' });
  });
  it('price_changed chez ProxNum : aucun débit', async () => {
    handler = rent({ buy: [409, { ok: false, error: 'price_changed' }] }); seed('r2', 20);
    expect(await buyRental('r2', { ref: 'rental000003', service: 'wa', country: 187, hours: 168 })).toMatchObject({ status: 'failed', error: 'price_changed' }); expect(store['balances/r2'].available).toBe(20e6);
  });
  it('annulation « en attente » (202) : remboursement uniquement quand ProxNum confirme', async () => {
    handler = rent(); seed('r3', 20); const o = await buyRental('r3', { ref: 'rental000004', service: 'wa', country: 187, hours: 168 });
    await cancelOrder('r3', o.id); expect(store['proxnum_orders/' + o.id].cancel).toBe('pending'); expect(store['balances/r3'].available).toBe(20e6 - chargeOf(4_200_000));
    handler = rent({ status: [200, { ok: true, rental: { status: 'cancelling' } }] }); await reconcilePendingCancel(o.id); expect(store['balances/r3'].available).toBe(20e6 - chargeOf(4_200_000));
    handler = rent({ status: [200, { ok: true, rental: { status: 'cancelled' } }] }); await reconcilePendingCancel(o.id); await reconcilePendingCancel(o.id);
    expect(store['balances/r3'].available).toBe(20e6); expect(consistent('r3')).toBe(true); expect(balanced()).toBe(true);
  });
  it('SMS reçus : messages et codes remontés', async () => {
    handler = rent(); seed('r4', 20); const o = await buyRental('r4', { ref: 'rental000005', service: 'wa', country: 187, hours: 168 });
    expect((await refreshOrder('r4', o.id)).messages[0]).toMatchObject({ code: '123456' });
  });
});

describe('services sans vrai nom', () => {
  it('numéros virtuels : seuls les services au nom connu sont proposés, et un pays sans service nommé disparaît', async () => {
    handler = u => u.searchParams.get('country') ? [200, { success: true, prices: { '6': { wa: { sell_price: 0.1, available: 5 }, zz: { sell_price: 0.1, available: 9 }, ig: { sell_price: 0.2, available: 0 } } } }]
      : [200, { success: true, prices: { '6': { wa: { sell_price: 0.1, available: 5 } }, '99': { zz: { sell_price: 0.1, available: 9 } } } }];
    expect((await virtualServices(6)).map(x => x.code)).toEqual(['wa']); expect((await virtualCountries()).map(c => c.id)).toEqual(['6']);
  });
  it('location : un service dont le nom est vide ou égal au code est supprimé ; prix = 3 × ProxNum', async () => {
    handler = () => [200, { ok: true, country: '187', hours: 24, durations: [{ hours: 24, label: '1 day' }], countries: [], cancel_window_seconds: 120, services: [{ code: 'wa', name: 'WhatsApp', price: 2, stock: 1 }, { code: 'xx', name: 'xx', price: 2, stock: 1 }, { code: 'yy', price: 2, stock: 1 }] }];
    const c = await rentalCatalog('187', 24); expect(c.services.map((x: any) => x.code)).toEqual(['wa']); expect(c.services[0].price).toBe('6.000000');
  });
});
