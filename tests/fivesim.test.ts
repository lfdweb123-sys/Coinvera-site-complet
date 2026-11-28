import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/auth', () => ({ HttpError: class extends Error { constructor(public status: number, public code: string) { super(code); } } }));
import { availability, availabilityFor, ban, buyActivation, cancel, check, clearCache, countries, deleteMaxPrice, extractCode, FivesimError, flash, maxPrices, orders, payments, pricesAll, pricesByCountry, products, profile, recentOrders, reuse, setMaxPrice } from '@/lib/numbers/fivesim';
import { PER_SECOND, resetLimits } from '@/lib/numbers/limits';
const reply = (body: unknown, status = 200) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
let calls: { url: string; init: RequestInit }[] = [];
const stub = (...rs: (Response | Error)[]) => { calls = []; vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => { calls.push({ url, init }); const r = rs.shift(); if (r instanceof Error) throw r; return r!; })); };
beforeEach(() => { resetLimits(); clearCache(); vi.stubEnv('FIVESIM_API_KEY', 'clé-test'); }); afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
// Exemple de la documentation (« Buy activation number »).
const ORDER = { id: 11631253, phone: '+447350690992', operator: 'vodafone', product: 'whatsapp', price: 21, status: 'PENDING', expires: '2018-10-13T08:28:38.809469028Z', sms: null, created_at: '2018-10-13T08:13:38.809469028Z', forwarding: false, forwarding_number: '', country: 'england' };
describe('achat (GET /user/buy/activation/{country}/{operator}/{product})', () => {
  it('appelle la bonne adresse avec la clé Bearer et Accept JSON, opérateur « any »', async () => {
    stub(reply(ORDER)); const o = await buyActivation({ country: 'england', product: 'whatsapp' }); expect(o.id).toBe(11631253);
    expect(calls[0].url).toBe('https://5sim.net/v1/user/buy/activation/england/any/whatsapp'); const h = calls[0].init.headers as Record<string, string>; expect(h.Authorization).toBe('Bearer clé-test'); expect(h.Accept).toBe('application/json');
  });
  it('transmet reuse, voice et le renvoi d’appel, et l’opérateur choisi', async () => {
    stub(reply(ORDER), reply(ORDER), reply(ORDER)); await buyActivation({ country: 'england', product: 'whatsapp', reuse: true, voice: true }); await buyActivation({ country: 'england', operator: 'vodafone', product: 'whatsapp' }); await buyActivation({ country: 'england', product: 'telegram', forwardingNumber: '12345678901' });
    expect(calls[0].url).toBe('https://5sim.net/v1/user/buy/activation/england/any/whatsapp?reuse=1&voice=1'); expect(calls[1].url).toBe('https://5sim.net/v1/user/buy/activation/england/vodafone/whatsapp'); expect(calls[2].url).toBe('https://5sim.net/v1/user/buy/activation/england/any/telegram?forwarding=1&number=12345678901');
  });
  it('« no free phones » en statut 200 est une erreur définitive (rien d’acheté)', async () => { stub(reply('no free phones')); await expect(buyActivation({ country: 'england', product: 'whatsapp' })).rejects.toMatchObject({ code: 'no_free_phones', definitive: true }); });
  it.each([['not enough user balance', 'provider_balance'], ['not enough rating', 'provider_rating'], ['bad country', 'bad_request'], ['bad operator', 'bad_request'], ['no product', 'bad_request'], ['server offline', 'provider_offline']])('400 « %s » → %s, définitif', async (txt, code) => {
    stub(reply(txt, 400)); await expect(buyActivation({ country: 'x', product: 'whatsapp' })).rejects.toMatchObject({ code, definitive: true, httpStatus: 400 });
  });
  it('401 = clé refusée ; 429 et 503 = limiteur (refusé avant exécution)', async () => {
    stub(reply('', 401), reply('', 429), reply('', 503));
    await expect(buyActivation({ country: 'x', product: 'whatsapp' })).rejects.toMatchObject({ code: 'provider_unauthorized', definitive: true });
    await expect(buyActivation({ country: 'x', product: 'whatsapp' })).rejects.toMatchObject({ code: 'provider_busy', definitive: true }); await expect(buyActivation({ country: 'x', product: 'whatsapp' })).rejects.toMatchObject({ code: 'provider_busy', definitive: true });
  });
  it('500, réponse 200 illisible et coupure réseau laissent un doute (non définitif)', async () => {
    stub(reply('internal error', 500), reply('???', 200), new Error('réseau'));
    for (let i = 0; i < 3; i++) await expect(buyActivation({ country: 'x', product: 'whatsapp' })).rejects.toMatchObject({ definitive: false });
  });
  it('refuse d’appeler 5sim sans clé configurée', async () => { vi.stubEnv('FIVESIM_API_KEY', ''); stub(reply(ORDER)); await expect(buyActivation({ country: 'england', product: 'whatsapp' })).rejects.toMatchObject({ code: 'numbers_unavailable' }); expect(calls).toHaveLength(0); });
});
describe('gestion de la commande', () => {
  it('check : lit les SMS', async () => { stub(reply({ ...ORDER, status: 'RECEIVED', sms: [{ created_at: 'x', date: 'x', sender: 'WhatsApp', text: 'Votre code WhatsApp : 123-456', code: '123456' }] })); const o = await check(11631253); expect(calls[0].url).toBe('https://5sim.net/v1/user/check/11631253'); expect(extractCode(o)).toEqual({ code: '123456', text: 'Votre code WhatsApp : 123-456' }); });
  it('cancel : « order has sms » et « order expired » sont reconnus', async () => {
    stub(reply('order has sms', 400), reply('order expired', 400), reply('order not found', 400), reply('order not found', 404));
    await expect(cancel(1)).rejects.toMatchObject({ code: 'order_has_sms' }); await expect(cancel(1)).rejects.toMatchObject({ code: 'order_expired' });
    await expect(cancel(1)).rejects.toMatchObject({ code: 'order_not_found' }); await expect(check(1)).rejects.toMatchObject({ code: 'order_not_found' });
  });
  it('cancel et ban utilisent /user/cancel/{id} et /user/ban/{id}', async () => { stub(reply({ ...ORDER, status: 'CANCELED' }), reply({ ...ORDER, status: 'BANNED' })); await cancel(7); await ban(7); expect(calls.map(c => c.url)).toEqual(['https://5sim.net/v1/user/cancel/7', 'https://5sim.net/v1/user/ban/7']); });
  it('recentOrders : lit « Data » de /user/orders', async () => { stub(reply({ Data: [ORDER, { bad: true }], Total: 2 })); const l = await recentOrders(5); expect(l).toHaveLength(1); expect(calls[0].url).toContain('/user/orders?category=activation&limit=5'); });
});
describe('réutilisation et profil', () => {
  it('reuse : /user/reuse/{produit}/{numéro sans +}', async () => { stub(reply(ORDER)); await reuse('whatsapp', '+44 7350 690992'); expect(calls[0].url).toBe('https://5sim.net/v1/user/reuse/whatsapp/447350690992'); });
  it('reuse : les refus de réutilisation sont reconnus', async () => { stub(reply('reuse not possible', 400)); await expect(reuse('whatsapp', '447350690992')).rejects.toMatchObject({ code: 'reuse_unavailable', definitive: true }); });
  it('profile : solde et note', async () => { stub(reply({ id: 1, email: 'a@b.c', balance: 4, rating: 96, frozen_balance: 0 })); expect(await profile()).toMatchObject({ balance: 4, rating: 96 }); expect(calls[0].url).toBe('https://5sim.net/v1/user/profile'); });
});
describe('extraction du code', () => {
  it('prend le champ code, sinon le texte', () => {
    expect(extractCode({ sms: [{ code: '98765', text: 'x' }] })?.code).toBe('98765');
    expect(extractCode({ sms: [{ code: '', text: 'Your Telegram code: 54321. Do not give it.' }] })?.code).toBe('54321');
    expect(extractCode({ sms: [{ text: '<#> 123-456 est votre code WhatsApp' }] })?.code).toBe('123-456'.replace('-', ''));
  });
  it('rien tant qu’aucun SMS n’est arrivé', () => { expect(extractCode({ sms: null })).toBeNull(); expect(extractCode({ sms: [] })).toBeNull(); });
});
describe('catalogue public (sans clé)', () => {
  it('lit les pays et leur code ISO', async () => {
    vi.stubEnv('FIVESIM_API_KEY', ''); stub(reply({ afghanistan: { iso: { af: 1 }, prefix: { '+93': 1 }, text_en: 'Afghanistan', virtual18: { activation: 1 } }, england: { iso: { gb: 1 }, text_en: 'England' } }));
    expect(await countries()).toEqual([{ slug: 'afghanistan', iso: 'AF', name: 'Afghanistan' }, { slug: 'england', iso: 'GB', name: 'England' }]); expect((calls[0].init.headers as Record<string, string>).Authorization).toBeUndefined();
  });
  it('agrège la disponibilité par pays et écarte les opérateurs sans numéro', async () => {
    vi.stubEnv('FIVESIM_API_KEY', '');
    stub(reply({ whatsapp: { england: { vodafone: { cost: 4, count: 1260, rate: 99.99 }, virtual52: { cost: 3, count: 0, rate: 90 }, ee: { cost: 5, count: 10, rate: 70 } }, chad: { x: { cost: 9, count: 0 } } } }));
    expect(await availability('whatsapp')).toEqual({ england: { count: 1270, rate: 99.99, cost: 4, operators: { vodafone: { count: 1260, rate: 99.99, cost: 4 }, ee: { count: 10, rate: 70, cost: 5 } } } }); expect(calls[0].url).toBe('https://5sim.net/v1/guest/prices?product=whatsapp');
  });
  it('met le résultat en cache (un seul appel réseau)', async () => { vi.stubEnv('FIVESIM_API_KEY', ''); stub(reply({ telegram: { france: { a: { cost: 1, count: 5 } } } })); await availability('telegram'); await availability('telegram'); expect(calls).toHaveLength(1); });
  it('échoue proprement si 5sim répond mal', async () => { vi.stubEnv('FIVESIM_API_KEY', ''); stub(reply('oups', 500)); await expect(availability('whatsapp')).rejects.toBeInstanceOf(FivesimError); });
});

describe('autres fonctions de la documentation', () => {
  it('orders : catégorie et pagination documentées', async () => { stub(reply({ Data: [ORDER], ProductNames: ['whatsapp'], Statuses: ['PENDING'], Total: 9 })); const r = await orders('hosting', { limit: 15, offset: 30, order: 'id', reverse: true }); expect(calls[0].url).toBe('https://5sim.net/v1/user/orders?category=hosting&limit=15&offset=30&order=id&reverse=true'); expect(r).toMatchObject({ Total: 9, ProductNames: ['whatsapp'] }); expect(r.Data).toHaveLength(1); });
  it('payments : historique paginé', async () => { stub(reply({ Data: [{ ID: 1, TypeName: 'charge', ProviderName: 'admin', Amount: 100, Balance: 100, CreatedAt: 'x' }], PaymentTypes: [{ Name: 'charge' }], PaymentProviders: [{ Name: 'admin' }], Total: 1 })); const r = await payments({ limit: 5, offset: 0, order: 'id', reverse: true }); expect(calls[0].url).toBe('https://5sim.net/v1/user/payments?limit=5&offset=0&order=id&reverse=true'); expect(r.Total).toBe(1); expect(r.PaymentTypes).toEqual([{ Name: 'charge' }]); });
  it('limite de prix : GET, POST et DELETE avec product_name', async () => {
    stub(reply([{ id: 14, product: 'whatsapp', price: 11, CreatedAt: 'x' }]), reply('', 200), reply('', 200), reply('record not found', 400));
    expect((await maxPrices())[0]).toMatchObject({ product: 'whatsapp', price: 11, created_at: 'x' }); await setMaxPrice('whatsapp', 30); await deleteMaxPrice('whatsapp');
    expect(calls[1].init.method).toBe('POST'); expect(JSON.parse(String(calls[1].init.body))).toEqual({ product_name: 'whatsapp', price: 30 }); expect(calls[2].init.method).toBe('DELETE'); expect(JSON.parse(String(calls[2].init.body))).toEqual({ product_name: 'whatsapp' });
    expect((calls[1].init.headers as Record<string, string>)['Content-Type']).toBe('application/json'); await expect(deleteMaxPrice('x')).rejects.toBeInstanceOf(FivesimError);
  });
  it('disponibilité par pays et produit, en direct', async () => {
    stub(reply({ england: { whatsapp: { vodafone: { cost: 8, count: 3, rate: 90 }, ee: { cost: 8, count: 0 } } } }), reply('country is incorrect', 400), reply('product is incorrect', 400));
    expect(await availabilityFor('whatsapp', 'england')).toEqual({ count: 3, rate: 90, cost: 8, operators: { vodafone: { count: 3, rate: 90, cost: 8 } } }); expect(calls[0].url).toBe('https://5sim.net/v1/guest/prices?country=england&product=whatsapp');
    expect(await availabilityFor('whatsapp', 'atlantis')).toBeNull(); expect(await availabilityFor('whatsapp', 'england')).toBeNull();
  });
  it('produits, prix par pays, tous les prix, notification', async () => {
    stub(reply({ facebook: { Category: 'activation', Qty: 133, Price: 21 } }), reply({ england: { facebook: {} } }), reply('country is incorrect', 400), reply({ england: {} }), reply({ text: 'Maintenance ce soir' }), reply({ text: ' ' }));
    expect((await products('england', 'any')).facebook.Qty).toBe(133); expect(calls[0].url).toBe('https://5sim.net/v1/guest/products/england/any');
    expect(await pricesByCountry('england')).toBeTruthy(); expect(calls[1].url).toBe('https://5sim.net/v1/guest/prices?country=england'); expect(await pricesByCountry('x')).toBeNull();
    expect(await pricesAll()).toBeTruthy(); expect(calls[3].url).toBe('https://5sim.net/v1/guest/prices'); expect(await flash('en')).toBe('Maintenance ce soir'); expect(calls[4].url).toBe('https://5sim.net/v1/guest/flash/en'); expect(await flash('en')).toBeNull();
  });
  it('produit inconnu de 5sim (« product is incorrect ») : aucun pays, sans erreur', async () => { vi.stubEnv('FIVESIM_API_KEY', ''); stub(reply('product is incorrect', 400)); expect(await availability('whatsapp')).toEqual({}); });
  it('ref (clé de parrainage) et maxPrice avec opérateur « any » uniquement', async () => {
    vi.stubEnv('FIVESIM_REF', 'ma-cle'); stub(reply(ORDER), reply(ORDER), reply(ORDER));
    await buyActivation({ country: 'england', product: 'whatsapp', maxPrice: 12 }); await buyActivation({ country: 'england', operator: 'vodafone', product: 'whatsapp', maxPrice: 12 }); await buyActivation({ country: 'any', product: 'telegram' });
    expect(calls[0].url).toBe('https://5sim.net/v1/user/buy/activation/england/any/whatsapp?maxPrice=12&ref=ma-cle'); expect(calls[1].url).toBe('https://5sim.net/v1/user/buy/activation/england/vodafone/whatsapp?ref=ma-cle'); expect(calls[2].url).toBe('https://5sim.net/v1/user/buy/activation/any/any/telegram?ref=ma-cle');
  });
});
describe('limites de la documentation (100 requêtes/s, bannissement 10 min)', () => {
  it('5 réponses 503/429 en 10 minutes : on cesse d’appeler 5sim', async () => {
    stub(...Array.from({ length: 5 }, () => reply('', 503))); for (let i = 0; i < 5; i++) await expect(check(1)).rejects.toMatchObject({ code: 'provider_busy' });
    const before = calls.length; await expect(check(1)).rejects.toMatchObject({ code: 'provider_busy', definitive: true }); expect(calls.length).toBe(before);
  });
  it('moins de 5 dépassements : on continue d’appeler', async () => { stub(reply('', 429), reply('', 429), reply({ ...ORDER, status: 'PENDING' })); await expect(check(1)).rejects.toBeTruthy(); await expect(check(1)).rejects.toBeTruthy(); expect((await check(1)).id).toBe(11631253); });
  it('reste sous 100 requêtes par seconde (plafond à 90)', () => { expect(PER_SECOND).toBeLessThan(100); });
});
