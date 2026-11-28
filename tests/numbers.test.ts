import { beforeEach, describe, expect, it, vi } from 'vitest';
// Faux Firestore en mémoire + faux 5sim : vérifie les écritures comptables, les remboursements et les cas d'échec des numéros WhatsApp / Telegram.
const { store, ref, coll, S } = vi.hoisted(() => {
  const store: Record<string, any> = {}; const S: any = { numbersEnabled: 1, numbersPriceXof: 8500, numbersMaxCost: 0 };
  const ref = (p: string): any => ({ path: p, id: p.split('/').pop(), get: async () => ({ exists: p in store, data: () => store[p] }), update: async (u: any) => { store[p] = { ...(store[p] ?? {}), ...u }; } });
  const coll = (c: string): any => ({ doc: (id = 'a' + Math.random().toString(36).slice(2)) => ref(`${c}/${id}`),
    where: (f: string, _o: string, v: any) => { const q = { limit: () => q, get: async () => { const docs = Object.entries(store).filter(([k, d]) => k.startsWith(c + '/') && d?.[f] === v).map(([k, d]) => ({ id: k.split('/').pop(), data: () => d })); return { empty: !docs.length, docs }; } }; return q; } });
  return { store, ref, coll, S };
});
vi.mock('@/lib/firebase-admin', () => ({ db: { doc: ref, collection: coll, runTransaction: async (fn: any) => fn({ get: async (r: any) => r.get(), set: (r: any, u: any, o?: any) => { store[r.path] = o?.merge ? { ...store[r.path], ...u } : u; }, update: (r: any, u: any) => { store[r.path] = { ...store[r.path], ...u }; }, create: (r: any, u: any) => { if (r.path in store) throw new Error('exists'); store[r.path] = u; } }) } }));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'TS' } }));
vi.mock('@/lib/auth', () => ({ HttpError: class extends Error { constructor(public status: number, public code: string) { super(code); } } }));
const notified: string[] = []; vi.mock('@/lib/audit', () => ({ notify: async (_u: string, t: string) => { notified.push(t); } }));
vi.mock('@/lib/log', () => ({ info: () => {}, warn: () => {}, error: () => {} }));
vi.mock('@/lib/settings', () => ({ getSettings: async () => S }));
vi.mock('@/lib/fiat/rates', () => ({ liveRate: async () => 600 }));
import { cancelOrder, createOrder, getOrder, release, reportUsed, reuseOrder, sweep, reconcileReview } from '@/lib/numbers/orders';
import { clearCache } from '@/lib/numbers/fivesim';
import { resetLimits } from '@/lib/numbers/limits';
import { replenish } from '@/lib/numbers/rating';

const CHARGE = Math.ceil((8500 * 1e6) / 600);   // 14 166 667 : 8 500 XOF à 600 XOF/USD, arrondi au-dessus
const P = (o: any = {}) => ({ id: 5001, phone: '+447350690992', operator: 'vodafone', product: 'whatsapp', price: 21, status: 'PENDING', expires: new Date(Date.now() + 15 * 60_000).toISOString(), sms: null, created_at: new Date().toISOString(), country: 'england', ...o });
const SMS = [{ sender: 'WhatsApp', text: 'Votre code WhatsApp : 123-456', code: '123456' }];
type H = (path: string) => [number, any] | 'throw'; let handler: H; const calls: string[] = [];
const reply = (b: any, s = 200) => new Response(typeof b === 'string' ? b : JSON.stringify(b), { status: s });
beforeEach(() => {
  resetLimits(); S.numbersMaxCost = 0; clearCache(); for (const k of Object.keys(store)) delete store[k]; calls.length = 0; notified.length = 0; process.env.FIVESIM_API_KEY = 'k';
  vi.stubGlobal('fetch', async (u: string) => { const path = new URL(u).pathname.replace('/v1', '') + new URL(u).search; calls.push(path); const r = handler(path); if (r === 'throw') throw new Error('timeout'); return reply(r[1], r[0]); });
  handler = path => path === '/guest/countries' ? [200, { england: { iso: { gb: 1 }, text_en: 'England' }, chad: { iso: { td: 1 }, text_en: 'Chad' } }] : [404, 'not found'];
});
const fund = (m: string, available = 40e6) => { store[`balances/${m}`] = { available, reserved: 0, fsim_reserved: 0 }; };
const bal = (m: string) => store[`balances/${m}`];
const total = (m: string) => (bal(m).available ?? 0) + (bal(m).fsim_reserved ?? 0) + (bal(m).fsim_spent ?? 0);
const entries = () => Object.values(store).filter((e: any) => e?.lines) as any[];
const balanced = () => entries().every(e => e.lines.filter((l: any) => l.dir === 'debit').reduce((a: number, l: any) => a + l.amount, 0) === e.lines.filter((l: any) => l.dir === 'credit').reduce((a: number, l: any) => a + l.amount, 0));
const inp = (ref: string, extra: any = {}) => ({ ref, service: 'whatsapp', country: 'england', ...extra });
const buyOk = (o: any = {}) => { handler = path => path === '/guest/countries' ? [200, { england: { iso: { gb: 1 }, text_en: 'England' } }] : path.startsWith('/user/buy/') ? [200, P(o)] : path.startsWith('/user/check/') ? [200, P(o)] : path.startsWith('/user/finish/') ? [200, P({ status: 'FINISHED' })] : [404, 'x']; };

describe('achat et règlement', () => {
  it('réserve le montant, délivre le numéro, puis règle en revenu quand le code arrive', async () => {
    fund('u1'); buyOk(); const v = await createOrder('u1', inp('ref00000001'));
    expect(v).toMatchObject({ status: 'waiting', phone: '+447350690992', countryName: 'Royaume-Uni', iso: 'GB', priceXof: 8500, refunded: false }); expect(v.priceUsd).toBe('14.17');
    expect(bal('u1')).toMatchObject({ available: 40e6 - CHARGE, fsim_reserved: CHARGE });
    expect(calls).toContain('/user/buy/activation/england/any/whatsapp');
    handler = path => path.startsWith('/user/check/') ? [200, P({ status: 'RECEIVED', sms: SMS })] : path.startsWith('/user/finish/') ? [200, P({ status: 'FINISHED' })] : [404, 'x'];
    const r = await getOrder('u1', 'u1_ref00000001'); expect(r).toMatchObject({ status: 'received', code: '123456' });
    expect(bal('u1')).toMatchObject({ available: 40e6 - CHARGE, fsim_reserved: 0, fsim_spent: CHARGE }); expect(total('u1')).toBe(40e6); expect(balanced()).toBe(true);
    expect(entries().find(e => e.type === 'numbers_settle').lines).toContainEqual({ account: 'platform:revenue', dir: 'credit', amount: CHARGE }); expect(calls).toContain('/user/finish/5001');
  });
  it('refuse sans solde suffisant : rien n’est réservé ni acheté', async () => {
    fund('u2', CHARGE - 1); buyOk(); await expect(createOrder('u2', inp('ref00000002'))).rejects.toMatchObject({ status: 402, code: 'insufficient_balance' });
    expect(bal('u2').available).toBe(CHARGE - 1); expect(calls.some(c => c.startsWith('/user/buy'))).toBe(false); expect(store['fivesim_orders/u2_ref00000002']).toBeUndefined();
  });
  it('un double clic (même référence) ne débite et n’achète qu’une fois', async () => {
    fund('u3'); buyOk(); const a = await createOrder('u3', inp('ref00000003')), b = await createOrder('u3', inp('ref00000003'));
    expect(b.id).toBe(a.id); expect(bal('u3').fsim_reserved).toBe(CHARGE); expect(calls.filter(c => c.startsWith('/user/buy')).length).toBe(1);
  });
  it('transmet l’opérateur choisi et les options documentées', async () => {
    fund('u4'); buyOk(); await createOrder('u4', inp('ref00000004', { service: 'telegram', operator: 'vodafone', reuse: true, voice: true }));
    expect(calls).toContain('/user/buy/activation/england/vodafone/telegram?reuse=1&voice=1');
  });
  it('refuse un service ou un pays inconnu avant toute réservation', async () => {
    fund('u5'); buyOk(); await expect(createOrder('u5', inp('ref00000005', { service: 'facebook' }))).rejects.toMatchObject({ code: 'invalid_service' });
    await expect(createOrder('u5', inp('ref00000006', { country: 'atlantis' }))).rejects.toMatchObject({ code: 'invalid_country' }); expect(bal('u5').available).toBe(40e6);
  });
});
describe('remboursement immédiat', () => {
  it.each([['no free phones', 200, 409, 'no_free_phones'], ['not enough user balance', 400, 503, 'numbers_unavailable'], ['not enough rating', 400, 503, 'numbers_unavailable'], ['server offline', 400, 503, 'numbers_unavailable'], ['bad operator', 400, 400, 'invalid_request']])('achat refusé « %s » → solde remis, erreur %i %s', async (text, st, status, code) => {
    fund('f1'); handler = path => path === '/guest/countries' ? [200, { england: { iso: { gb: 1 }, text_en: 'England' } }] : [st, text];
    await expect(createOrder('f1', inp('ref0000000f'))).rejects.toMatchObject({ status, code });
    expect(bal('f1')).toMatchObject({ available: 40e6, fsim_reserved: 0 }); expect(store['fivesim_orders/f1_ref0000000f']).toMatchObject({ status: 'failed', refunded: true }); expect(balanced()).toBe(true); expect(notified).toContain('Commande de numéro annulée');
  });
  it('annulation par l’utilisateur : 5sim annule, le montant revient aussitôt', async () => {
    fund('c1'); buyOk(); await createOrder('c1', inp('ref0000000c')); handler = path => path.startsWith('/user/cancel/') ? [200, P({ status: 'CANCELED' })] : [404, 'x'];
    const v = await cancelOrder('c1', 'c1_ref0000000c'); expect(v).toMatchObject({ status: 'failed', refunded: true, phone: null }); expect(bal('c1')).toMatchObject({ available: 40e6, fsim_reserved: 0 }); expect(calls).toContain('/user/cancel/5001'); expect(notified).toContain('Numéro remboursé'); expect(balanced()).toBe(true);
  });
  it('annulation refusée car le code est arrivé : pas de remboursement, le code s’affiche', async () => {
    fund('c2'); buyOk(); await createOrder('c2', inp('ref0000000d'));
    handler = path => path.startsWith('/user/cancel/') ? [400, 'order has sms'] : path.startsWith('/user/check/') ? [200, P({ status: 'RECEIVED', sms: SMS })] : path.startsWith('/user/finish/') ? [200, P()] : [404, 'x'];
    const v = await cancelOrder('c2', 'c2_ref0000000d'); expect(v).toMatchObject({ status: 'received', code: '123456' }); expect(bal('c2')).toMatchObject({ fsim_reserved: 0, fsim_spent: CHARGE }); expect(total('c2')).toBe(40e6);
  });
  it('« numéro déjà utilisé » : ban chez 5sim puis remboursement', async () => {
    fund('b1'); buyOk(); await createOrder('b1', inp('ref0000000b')); handler = path => path.startsWith('/user/ban/') ? [200, P({ status: 'BANNED' })] : [404, 'x'];
    expect(await reportUsed('b1', 'b1_ref0000000b')).toMatchObject({ status: 'failed', refunded: true }); expect(calls).toContain('/user/ban/5001'); expect(bal('b1').available).toBe(40e6);
  });
  it('annulation d’un ordre déjà expiré chez 5sim : remboursé quand même', async () => {
    fund('c3'); buyOk(); await createOrder('c3', inp('ref0000000e')); handler = path => path.startsWith('/user/cancel/') ? [400, 'order expired'] : [404, 'x'];
    expect(await cancelOrder('c3', 'c3_ref0000000e')).toMatchObject({ status: 'failed', refunded: true }); expect(bal('c3').available).toBe(40e6);
  });
  it('code non reçu : statut TIMEOUT chez 5sim = remboursement', async () => {
    fund('t1'); buyOk(); await createOrder('t1', inp('ref00000010')); handler = path => path.startsWith('/user/check/') ? [200, P({ status: 'TIMEOUT' })] : [404, 'x'];
    expect(await getOrder('t1', 't1_ref00000010')).toMatchObject({ status: 'failed', refunded: true, error: 'timeout' }); expect(bal('t1')).toMatchObject({ available: 40e6, fsim_reserved: 0 });
  });
  it('délai dépassé sans réponse définitive de 5sim : on annule nous-mêmes puis on rembourse', async () => {
    fund('t2'); buyOk(); await createOrder('t2', inp('ref00000011')); store['fivesim_orders/t2_ref00000011'].expiresAt = Date.now() - 5 * 60_000;
    handler = path => path.startsWith('/user/check/') ? [200, P({ status: 'PENDING' })] : path.startsWith('/user/cancel/') ? [200, P({ status: 'CANCELED' })] : [404, 'x'];
    expect(await getOrder('t2', 't2_ref00000011')).toMatchObject({ status: 'failed', refunded: true, error: 'timeout' }); expect(bal('t2').available).toBe(40e6);
  });
  it('le remboursement ne se fait qu’une fois', async () => {
    fund('r1'); buyOk(); await createOrder('r1', inp('ref00000012')); expect(await release('r1_ref00000012', 'timeout')).toBe(true); expect(await release('r1_ref00000012', 'timeout')).toBe(false); expect(bal('r1')).toMatchObject({ available: 40e6, fsim_reserved: 0 });
  });
  it('un autre utilisateur ne peut ni voir ni annuler la commande', async () => {
    fund('o1'); buyOk(); await createOrder('o1', inp('ref00000013')); await expect(cancelOrder('intrus', 'o1_ref00000013')).rejects.toMatchObject({ status: 404 }); await expect(getOrder('intrus', 'o1_ref00000013')).rejects.toMatchObject({ status: 404 });
  });
  it('le filet de sécurité (cron) rembourse même si l’utilisateur a quitté la page', async () => {
    fund('s1'); buyOk(); await createOrder('s1', inp('ref00000014')); handler = path => path.startsWith('/user/check/') ? [200, P({ status: 'CANCELED' })] : [404, 'x'];
    expect(await sweep()).toMatchObject({ checked: 1, errors: 0 }); expect(bal('s1').available).toBe(40e6);
  });
});
describe('achat d’issue incertaine', () => {
  it('délai dépassé à l’achat : les fonds restent réservés, puis la commande est retrouvée dans l’historique', async () => {
    fund('i1'); handler = path => path === '/guest/countries' ? [200, { england: { iso: { gb: 1 }, text_en: 'England' } }] : path.startsWith('/user/buy/') ? 'throw' : path.startsWith('/user/orders') ? [200, { Data: [], Total: 0 }] : [404, 'x'];
    const v = await createOrder('i1', inp('ref00000015')); expect(v.status).toBe('review'); expect(bal('i1')).toMatchObject({ available: 40e6 - CHARGE, fsim_reserved: CHARGE });
    handler = path => path.startsWith('/user/orders') ? [200, { Data: [P({ id: 7777 })], Total: 1 }] : [404, 'x'];
    expect(await reconcileReview('i1_ref00000015')).toBe('attached'); expect(store['fivesim_orders/i1_ref00000015']).toMatchObject({ status: 'waiting', providerId: 7777 });
  });
  it('ne rattache jamais un numéro déjà attribué à une autre commande', async () => {
    fund('i2'); fund('i3'); store['fivesim_orders/i3_x'] = { merchantId: 'i3', providerId: 7777, status: 'waiting' };
    handler = path => path === '/guest/countries' ? [200, { england: { iso: { gb: 1 }, text_en: 'England' } }] : path.startsWith('/user/buy/') ? [500, 'internal'] : path.startsWith('/user/orders') ? [200, { Data: [P({ id: 7777 })], Total: 1 }] : [404, 'x'];
    const v = await createOrder('i2', inp('ref00000016')); expect(v.status).toBe('review');
  });
  it('introuvable après 20 min : l’utilisateur est remboursé', async () => {
    fund('i4'); handler = path => path === '/guest/countries' ? [200, { england: { iso: { gb: 1 }, text_en: 'England' } }] : path.startsWith('/user/buy/') ? 'throw' : path.startsWith('/user/orders') ? [200, { Data: [], Total: 0 }] : [404, 'x'];
    await createOrder('i4', inp('ref00000017')); expect(await reconcileReview('i4_ref00000017')).toBe('pending'); store['fivesim_orders/i4_ref00000017'].requestedAt = Date.now() - 21 * 60_000;
    expect(await reconcileReview('i4_ref00000017')).toBe('released'); expect(bal('i4')).toMatchObject({ available: 40e6, fsim_reserved: 0 }); expect(balanced()).toBe(true);
  });
});
describe('réutilisation d’un numéro', () => {
  it('rachète le même numéro au même prix (GET /user/reuse/{produit}/{numéro})', async () => {
    fund('e1'); buyOk(); await createOrder('e1', inp('ref00000018', { reuse: true }));
    handler = path => path.startsWith('/user/check/') ? [200, P({ status: 'RECEIVED', sms: SMS })] : path.startsWith('/user/finish/') ? [200, P()] : [404, 'x']; await getOrder('e1', 'e1_ref00000018');
    handler = path => path === '/guest/countries' ? [200, { england: { iso: { gb: 1 }, text_en: 'England' } }] : path.startsWith('/user/reuse/') ? [200, P({ id: 5002 })] : [404, 'x'];
    const v = await reuseOrder('e1', 'e1_ref00000018', 'ref00000019'); expect(v).toMatchObject({ status: 'waiting', kind: 'reuse' }); expect(calls).toContain('/user/reuse/whatsapp/447350690992'); expect(bal('e1')).toMatchObject({ fsim_reserved: CHARGE, fsim_spent: CHARGE });
  });
  it('refuse la réutilisation si le numéro n’a pas été acheté avec « reuse »', async () => {
    fund('e2'); buyOk(); await createOrder('e2', inp('ref0000001a')); handler = path => path.startsWith('/user/check/') ? [200, P({ status: 'RECEIVED', sms: SMS })] : [200, P()]; await getOrder('e2', 'e2_ref0000001a');
    await expect(reuseOrder('e2', 'e2_ref0000001a', 'ref0000001b')).rejects.toMatchObject({ code: 'reuse_unavailable' });
  });
});

const rating = (m: string) => store[`fivesim_users/${m}`];
const setRating = (m: string, r: number, blockedUntil = 0) => { store[`fivesim_users/${m}`] = { rating: r, blockedUntil }; };
const checkAs = (status: string, sms: any = null) => (path: string): [number, any] => path.startsWith('/user/check/') ? [200, P({ status, sms })] : path.startsWith('/user/finish/') ? [200, P()] : [404, 'x'];
describe('note de la documentation 5sim appliquée à chaque utilisateur', () => {
  it('code reçu avant la fin du délai : +0,5 ; après le délai : +0,4', async () => {
    fund('n1'); setRating('n1', 5000); buyOk(); await createOrder('n1', inp('ref00000020')); handler = checkAs('RECEIVED', SMS); await getOrder('n1', 'n1_ref00000020'); expect(rating('n1').rating).toBe(5050);
    fund('n2'); setRating('n2', 5000); buyOk(); await createOrder('n2', inp('ref00000021')); store['fivesim_orders/n2_ref00000021'].expiresAt = Date.now() - 1000; handler = checkAs('RECEIVED', SMS); await getOrder('n2', 'n2_ref00000021'); expect(rating('n2').rating).toBe(5040);
  });
  it('annulation −0,1 ; numéro déjà utilisé −0,1 ; expiration −0,15', async () => {
    fund('n3'); setRating('n3', 5000); buyOk(); await createOrder('n3', inp('ref00000022')); handler = path => path.startsWith('/user/cancel/') ? [200, P({ status: 'CANCELED' })] : [404, 'x']; await cancelOrder('n3', 'n3_ref00000022'); expect(rating('n3').rating).toBe(4990);
    fund('n4'); setRating('n4', 5000); buyOk(); await createOrder('n4', inp('ref00000023')); handler = path => path.startsWith('/user/ban/') ? [200, P({ status: 'BANNED' })] : [404, 'x']; await reportUsed('n4', 'n4_ref00000023'); expect(rating('n4').rating).toBe(4990);
    fund('n5'); setRating('n5', 5000); buyOk(); await createOrder('n5', inp('ref00000024')); handler = checkAs('TIMEOUT'); await getOrder('n5', 'n5_ref00000024'); expect(rating('n5').rating).toBe(4985);
  });
  it('aucun changement de note quand l’achat échoue ou quand 5sim annule de son côté', async () => {
    fund('n6'); setRating('n6', 5000); handler = path => path === '/guest/countries' ? [200, { england: { iso: { gb: 1 }, text_en: 'England' } }] : path.startsWith('/guest/prices') ? [200, { england: { whatsapp: { vodafone: { cost: 1, count: 5 } } } }] : [200, 'no free phones']; await expect(createOrder('n6', inp('ref00000025'))).rejects.toBeTruthy(); expect(rating('n6').rating).toBe(5000);
    fund('n7'); setRating('n7', 5000); buyOk(); await createOrder('n7', inp('ref00000026')); handler = checkAs('CANCELED'); await getOrder('n7', 'n7_ref00000026'); expect(rating('n7').rating).toBe(5000);
  });
  it('à zéro : achats bloqués 24 h sans rien réserver, puis la note revient à 96', async () => {
    fund('z1'); setRating('z1', 10); buyOk(); await createOrder('z1', inp('ref00000027')); handler = path => path.startsWith('/user/cancel/') ? [200, P({ status: 'CANCELED' })] : [404, 'x']; await cancelOrder('z1', 'z1_ref00000027');
    expect(rating('z1')).toMatchObject({ rating: 0 }); expect(rating('z1').blockedUntil).toBeGreaterThan(Date.now() + 23 * 3600_000);
    buyOk(); await expect(createOrder('z1', inp('ref00000028'))).rejects.toMatchObject({ status: 429, code: 'rating_blocked' }); expect(bal('z1').fsim_reserved).toBe(0); expect(store['fivesim_orders/z1_ref00000028']).toBeUndefined();
    store['fivesim_users/z1'].blockedUntil = Date.now() - 1000; expect((await createOrder('z1', inp('ref00000029'))).status).toBe('waiting');
  });
  it('recharge du solde : +8 points, plafonnés à 96', async () => { setRating('r2', 5000); await replenish('r2'); expect(rating('r2').rating).toBe(5800); setRating('r3', 9500); await replenish('r3'); expect(rating('r3').rating).toBe(9600); await replenish('r4'); expect(rating('r4').rating).toBe(9600); });
});
describe('vérification de stock en direct, « any », renvoi d’appel, prix maximal', () => {
  const live = (body: any) => (path: string): [number, any] => path === '/guest/countries' ? [200, { england: { iso: { gb: 1 }, text_en: 'England' } }] : path.startsWith('/guest/prices') ? [200, body] : path.startsWith('/user/buy/') ? [200, P()] : [404, 'x'];
  it('aucun numéro libre en direct : refusé avant toute réservation', async () => {
    fund('k1'); handler = live({ england: { whatsapp: { vodafone: { cost: 1, count: 0 } } } }); await expect(createOrder('k1', inp('ref00000030'))).rejects.toMatchObject({ status: 409, code: 'no_free_phones' });
    expect(bal('k1')).toMatchObject({ available: 40e6, fsim_reserved: 0 }); expect(calls.some(c => c.startsWith('/user/buy'))).toBe(false); expect(calls).toContain('/guest/prices?country=england&product=whatsapp');
  });
  it('opérateur choisi sans numéro alors que d’autres en ont : refusé ; avec numéro : accepté', async () => {
    fund('k2'); handler = live({ england: { whatsapp: { vodafone: { cost: 1, count: 4 }, ee: { cost: 1, count: 0 } } } });
    await expect(createOrder('k2', inp('ref00000031', { operator: 'ee' }))).rejects.toMatchObject({ code: 'no_free_phones' }); expect((await createOrder('k2', inp('ref00000032', { operator: 'vodafone' }))).status).toBe('waiting');
  });
  it('si 5sim ne répond pas à la vérification, l’achat tranche (échec = remboursement)', async () => {
    fund('k3'); handler = path => path === '/guest/countries' ? [200, { england: { iso: { gb: 1 }, text_en: 'England' } }] : path.startsWith('/guest/prices') ? [500, 'oops'] : path.startsWith('/user/buy/') ? [200, P()] : [404, 'x']; expect((await createOrder('k3', inp('ref00000033'))).status).toBe('waiting');
  });
  it('« n’importe quel pays » : pays « any » chez 5sim, pays réel enregistré à la livraison', async () => {
    fund('a1'); buyOk({ country: 'england' }); const v = await createOrder('a1', inp('ref00000034', { country: 'any' }));
    expect(calls).toContain('/user/buy/activation/any/any/whatsapp'); expect(calls.some(c => c.startsWith('/guest/prices'))).toBe(false); expect(v).toMatchObject({ status: 'waiting', country: 'england', countryName: 'Royaume-Uni', iso: 'GB' });
  });
  it('renvoi d’appel : numéro international sans +, longueur valide pour le pays (Bénin 0162758703 → 229…)', async () => {
    fund('f2'); buyOk({ forwarding: true, forwarding_number: '2290162758703' }); const v = await createOrder('f2', inp('ref00000035', { forwardingNumber: '2290162758703' }));
    expect(calls).toContain('/user/buy/activation/england/any/whatsapp?forwarding=1&number=2290162758703'); expect(v.forwardingNumber).toBe('2290162758703'); expect(v.options.forwarding).toBe(true);
  });
  it('renvoi d’appel invalide (trop court, trop long, lettres) : refusé sans rien réserver', async () => {
    fund('f3'); buyOk(); for (const [i, n] of ['12345', '1234567890123456', '22901627', 'abc'].entries()) await expect(createOrder('f3', inp(`ref0000004${i}`, { forwardingNumber: n }))).rejects.toMatchObject({ status: 400, code: 'invalid_forwarding' });
    expect(bal('f3').fsim_reserved).toBe(0); expect(calls.some(c => c.startsWith('/user/buy'))).toBe(false);
  });
  it('5sim refuse le numéro de renvoi : message clair, montant remis', async () => {
    fund('f4'); handler = path => path === '/guest/countries' ? [200, { england: { iso: { gb: 1 }, text_en: 'England' } }] : path.startsWith('/guest/prices') ? [200, { england: { whatsapp: { v: { cost: 1, count: 3 } } } }] : path.startsWith('/user/buy/') ? [400, 'bad forwarding number'] : [404, 'x'];
    await expect(createOrder('f4', inp('ref00000036', { forwardingNumber: '2290162758703' }))).rejects.toMatchObject({ status: 400, code: 'forwarding_rejected' }); expect(bal('f4')).toMatchObject({ available: 40e6, fsim_reserved: 0 });
  });
  it('prix maximal du réglage transmis à 5sim (opérateur « any » seulement)', async () => {
    S.numbersMaxCost = 15; fund('m1'); buyOk(); await createOrder('m1', inp('ref00000037')); expect(calls).toContain('/user/buy/activation/england/any/whatsapp?maxPrice=15');
    fund('m2'); await createOrder('m2', inp('ref00000038', { operator: 'vodafone' })); expect(calls).toContain('/user/buy/activation/england/vodafone/whatsapp');
  });
});
