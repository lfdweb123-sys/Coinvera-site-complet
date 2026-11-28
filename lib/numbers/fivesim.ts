// Client 5sim, écrit d'après https://5sim.net/docs (section « User », « Purchase », « Order management », « Products and prices »).
// Points de la documentation respectés ici :
//  - authentification : en-tête « Authorization: Bearer <clé> » + « Accept: application/json » ; les routes /guest/* sont publiques (sans clé) ;
//  - achat d'activation : GET /user/buy/activation/{country}/{operator}/{product}, « any » = n'importe quel opérateur, maxPrice n'a d'effet qu'avec l'opérateur « any » ;
//  - les erreurs de l'achat sont du TEXTE brut (« no free phones », « not enough user balance »…), parfois avec un statut 200 : on lit donc le corps, pas seulement le statut ;
//  - statuts d'une commande : PENDING, RECEIVED, CANCELED, TIMEOUT, FINISHED, BANNED ; attente maximale de 15 minutes ;
//  - annuler / bannir sont refusés si la commande a déjà reçu un SMS (« order has sms ») ou a expiré (« order expired ») ;
//  - limites : 100 requêtes/s par IP (503) et par clé (429).
import { HttpError } from '../auth';
import { gate, isBanned, noteLimitHit } from './limits';

export const BASE = 'https://5sim.net/v1';
export const SERVICES = { whatsapp: { label: 'WhatsApp', product: 'whatsapp' }, telegram: { label: 'Telegram', product: 'telegram' } } as const;
export type Service = keyof typeof SERVICES;
export const isService = (s: string): s is Service => Object.prototype.hasOwnProperty.call(SERVICES, s);

export type Sms = { created_at?: string; date?: string; sender?: string; text?: string; code?: string };
export type P5Status = 'PENDING' | 'RECEIVED' | 'CANCELED' | 'TIMEOUT' | 'FINISHED' | 'BANNED';
export type P5Order = { id: number; phone: string; operator?: string; product: string; price: number; status: P5Status; expires: string; sms: Sms[] | null; created_at: string; country: string; forwarding?: boolean; forwarding_number?: string };
export type FivesimCode = 'no_free_phones' | 'provider_balance' | 'provider_rating' | 'bad_request' | 'provider_offline' | 'provider_busy' | 'provider_unavailable' | 'provider_unauthorized'
  | 'order_not_found' | 'order_expired' | 'order_has_sms' | 'hosting_order' | 'reuse_unavailable' | 'unknown';
/** definitive = on est certain que la demande n'a PAS été exécutée (aucun numéro acheté). Faux = résultat incertain (délai dépassé, erreur 5xx) : il faut vérifier avant de rembourser. */
export class FivesimError extends Error { constructor(public code: FivesimCode, public definitive: boolean, public httpStatus = 0) { super(code); } }

const TEXT: [RegExp, FivesimCode][] = [
  [/^no free phones$/, 'no_free_phones'], [/^not enough user balance$/, 'provider_balance'], [/^not enough rating$/, 'provider_rating'],
  [/^(select country|select operator|bad country|bad operator|no product)$/, 'bad_request'], [/^server offline$/, 'provider_offline'],
  [/^order not found$/, 'order_not_found'], [/^order expired$/, 'order_expired'], [/^order has sms$/, 'order_has_sms'], [/^hosting order$/, 'hosting_order'], [/^reuse /, 'reuse_unavailable'],
];
export const codeOfText = (t: string): FivesimCode | null => { const x = t.trim().toLowerCase().replace(/^"|"$/g, ''); return TEXT.find(([r]) => r.test(x))?.[1] ?? null; };

const key = () => { const k = process.env.FIVESIM_API_KEY?.trim(); if (!k) throw new HttpError(503, 'numbers_unavailable'); return k; };
async function call(path: string, auth: boolean, init?: { method?: string; body?: unknown }) {
  if (await isBanned()) throw new FivesimError('provider_busy', true, 503);   // bannissement de 10 minutes de la documentation : on n'appelle plus 5sim
  await gate();                                                               // 90 requêtes/s au plus (limite documentée : 100)
  const headers: Record<string, string> = { Accept: 'application/json' }; if (auth) headers.Authorization = `Bearer ${key()}`; if (init?.body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response; try { res = await fetch(BASE + path, { method: init?.method ?? 'GET', headers, body: init?.body !== undefined ? JSON.stringify(init.body) : undefined, signal: AbortSignal.timeout(15_000), cache: 'no-store' }); } catch { throw new FivesimError('provider_unavailable', false); }
  if (res.status === 429 || res.status === 503) noteLimitHit();
  const text = (await res.text().catch(() => '')).trim(); let json: any; try { json = JSON.parse(text); } catch {}
  return { status: res.status, text, json };
}
/** Erreurs d'une réponse qui n'est pas un JSON utile. `buy` : un 5xx laisse un doute sur l'exécution (non définitif). */
function failure(r: { status: number; text: string }): FivesimError {
  if (r.status === 401) return new FivesimError('provider_unauthorized', true, 401);
  if (r.status === 429 || r.status === 503) return new FivesimError('provider_busy', true, r.status);   // limiteur de débit : la demande est refusée avant exécution
  const c = codeOfText(r.text); if (c) return new FivesimError(c, true, r.status);
  if (r.status >= 500) return new FivesimError('provider_unavailable', false, r.status);
  return new FivesimError('unknown', r.status >= 400, r.status);
}
const isOrder = (j: any): j is P5Order => !!j && typeof j === 'object' && typeof j.id === 'number' && typeof j.phone === 'string';

// ---------- Catalogue public (sans clé) ----------
export type Country = { slug: string; iso: string; name: string };
export type OperatorAvail = { count: number; rate: number | null; cost: number };
export type Availability = OperatorAvail & { operators: Record<string, OperatorAvail> };
const cache = new Map<string, { at: number; v: unknown }>();
async function cached<T>(k: string, ttlMs: number, f: () => Promise<T>): Promise<T> {
  const h = cache.get(k); if (h && Date.now() - h.at < ttlMs) return h.v as T;
  const v = await f(); cache.set(k, { at: Date.now(), v }); return v;
}
export const clearCache = () => cache.clear();
/** GET /guest/countries : { slug: { iso: {af:1}, prefix: {...}, text_en, <opérateur>: {...} } } */
export const countries = () => cached('countries', 6 * 3600_000, async (): Promise<Country[]> => {
  const r = await call('/guest/countries', false); if (r.status !== 200 || !r.json || typeof r.json !== 'object') throw failure(r);
  return Object.entries(r.json as Record<string, any>).map(([slug, c]) => ({ slug, iso: String(Object.keys(c?.iso ?? {})[0] ?? '').toUpperCase(), name: String(c?.text_en ?? slug) }));
});
/** GET /guest/prices?product=… : { <produit>: { <pays>: { <opérateur>: { cost, count, rate } } } }, agrégé par pays (opérateurs sans numéro écartés). */
export const availability = (service: Service) => cached('av_' + service, 5 * 60_000, async (): Promise<Record<string, Availability>> => {
  const p = SERVICES[service].product; const r = await call(`/guest/prices?product=${encodeURIComponent(p)}`, false);
  if (r.status === 400 && /product is incorrect/i.test(r.text)) return {};   // produit inconnu de 5sim : aucun pays
  if (r.status !== 200 || !r.json || typeof r.json !== 'object') throw failure(r);
  const out: Record<string, Availability> = {};
  for (const [country, ops] of Object.entries((r.json as any)[p] ?? {}) as [string, Record<string, any>][]) {
    let count = 0, rate: number | null = null, cost = Infinity; const operators: Record<string, OperatorAvail> = {};
    for (const [name, o] of Object.entries(ops ?? {})) {
      const n = Number(o?.count) || 0; if (n < 1) continue; const c = Number(o?.cost) || 0, r = typeof o?.rate === 'number' ? o.rate : null;
      operators[name] = { count: n, rate: r, cost: c }; count += n; cost = Math.min(cost, c); if (r !== null) rate = Math.max(rate ?? 0, r);
    }
    if (count > 0) out[country] = { count, rate, cost: Number.isFinite(cost) ? cost : 0, operators };
  }
  return out;
});

const aggregate = (ops: Record<string, any> | undefined): Availability | null => {
  let count = 0, rate: number | null = null, cost = Infinity; const operators: Record<string, OperatorAvail> = {};
  for (const [name, o] of Object.entries(ops ?? {})) { const n = Number(o?.count) || 0; if (n < 1) continue; const c = Number(o?.cost) || 0, r = typeof o?.rate === 'number' ? o.rate : null; operators[name] = { count: n, rate: r, cost: c }; count += n; cost = Math.min(cost, c); if (r !== null) rate = Math.max(rate ?? 0, r); }
  return count > 0 ? { count, rate, cost: Number.isFinite(cost) ? cost : 0, operators } : null;
};
/** GET /guest/prices?country=…&product=… (« Prices by country and product ») : disponibilité EN DIRECT, sans cache, juste avant un achat. null = aucun numéro libre ou pays/produit inconnu (400). */
export async function availabilityFor(service: Service, country: string): Promise<Availability | null> {
  const p = SERVICES[service].product; const r = await call(`/guest/prices?country=${encodeURIComponent(country)}&product=${encodeURIComponent(p)}`, false);
  if (r.status === 400 && /(country|product) is incorrect/i.test(r.text)) return null;
  if (r.status !== 200 || !r.json || typeof r.json !== 'object') throw failure(r);
  return aggregate((r.json as any)?.[country]?.[p]);
}
/** GET /guest/products/{country}/{operator} : produits, quantités et prix (« any » = tous). */
export async function products(country = 'any', operator = 'any'): Promise<Record<string, { Category: string; Qty: number; Price: number }>> {
  const r = await call(`/guest/products/${encodeURIComponent(country)}/${encodeURIComponent(operator)}`, false); if (r.status !== 200 || !r.json) throw failure(r); return r.json;
}
/** GET /guest/flash/{lang} : notification de 5sim (maintenance, avertissement). */
export async function flash(lang = 'en'): Promise<string | null> { const r = await call(`/guest/flash/${encodeURIComponent(lang)}`, true); return r.status === 200 && typeof r.json?.text === 'string' && r.json.text.trim() ? r.json.text : null; }

// ---------- Compte et commandes (clé requise) ----------
export type BuyOptions = { country: string; operator?: string; product: string; reuse?: boolean; voice?: boolean; forwardingNumber?: string; maxPrice?: number };
/** GET /user/buy/activation/{country}/{operator}/{product}?reuse=1&voice=1&forwarding=1&number=…
 *  « any » = n'importe quel opérateur ; reuse = numéro qu'on pourra racheter ; voice = appel vocal d'un robot possible ; forwarding + number (11 chiffres) = renvoi de l'appel ;
 *  maxPrice = prix maximal (opérateur « any » seulement) ; ref = clé de parrainage (variable FIVESIM_REF). */
export async function buyActivation(o: BuyOptions): Promise<P5Order> {
  const q = new URLSearchParams(); if (o.reuse) q.set('reuse', '1'); if (o.voice) q.set('voice', '1'); if (o.forwardingNumber) { q.set('forwarding', '1'); q.set('number', o.forwardingNumber); }
  if (o.maxPrice && o.maxPrice > 0 && (!o.operator || o.operator === 'any')) q.set('maxPrice', String(o.maxPrice));   // documentation : maxPrice ne vaut qu'avec l'opérateur « any »
  const ref = process.env.FIVESIM_REF?.trim(); if (ref) q.set('ref', ref);                                       // clé de parrainage du développeur (facultative)
  const qs = q.toString() ? `?${q}` : '';
  const r = await call(`/user/buy/activation/${encodeURIComponent(o.country)}/${encodeURIComponent(o.operator || 'any')}/${encodeURIComponent(o.product)}${qs}`, true);
  if (r.status === 200 && isOrder(r.json)) return r.json;
  if (r.status === 200) { const c = codeOfText(r.text); throw c ? new FivesimError(c, true, 200) : new FivesimError('unknown', false, 200); }   // 200 sans commande lisible : on ne sait pas
  throw failure(r);
}
async function order(path: string): Promise<P5Order> {
  const r = await call(path, true); if (r.status === 200 && isOrder(r.json)) return r.json; if (r.status === 404 && !codeOfText(r.text)) throw new FivesimError('order_not_found', true, 404); throw failure(r);
}
const id = (n: number) => encodeURIComponent(String(n));
export const check = (n: number) => order(`/user/check/${id(n)}`);       // GET /user/check/{id} : liste des SMS
export const finish = (n: number) => order(`/user/finish/${id(n)}`);     // GET /user/finish/{id} : clôture après réception du code
export const cancel = (n: number) => order(`/user/cancel/${id(n)}`);     // GET /user/cancel/{id} : refusé si un SMS est déjà arrivé
export const ban = (n: number) => order(`/user/ban/${id(n)}`);           // GET /user/ban/{id} : numéro déjà utilisé
/** GET /user/reuse/{product}/{number} : racheter un numéro déjà utilisé (acheté avec reuse=1), numéro sans le « + ». */
export const reuse = (product: string, number: string) => order(`/user/reuse/${encodeURIComponent(product)}/${encodeURIComponent(number.replace(/\D/g, ''))}`);
export type MaxPrice = { id: number; product: string; price: number; created_at?: string };
/** Limite de prix par produit (documentation « Prices limit ») : 5sim refuse tout achat plus cher que la limite. */
export async function maxPrices(): Promise<MaxPrice[]> { const r = await call('/user/max-prices', true); if (r.status !== 200 || !Array.isArray(r.json)) throw failure(r); return r.json.map((x: any) => ({ id: x.id, product: x.product, price: x.price, created_at: x.created_at ?? x.CreatedAt })); }
export async function setMaxPrice(product: string, price: number): Promise<void> { const r = await call('/user/max-prices', true, { method: 'POST', body: { product_name: product, price } }); if (r.status !== 200) throw failure(r); }
export async function deleteMaxPrice(product: string): Promise<void> { const r = await call('/user/max-prices', true, { method: 'DELETE', body: { product_name: product } }); if (r.status !== 200) throw failure(r); }
export type Payment = { ID: number; TypeName: string; ProviderName: string; Amount: number; Balance: number; CreatedAt: string };
/** GET /user/payments?limit&offset&order&reverse : recharges du compte 5sim. */
export async function payments(p: Page = { limit: 15, offset: 0, order: 'id', reverse: true }): Promise<{ Data: Payment[]; PaymentTypes: unknown[]; PaymentProviders: unknown[]; Total: number }> {
  const r = await call(`/user/payments${pageQs(p) ? '?' + pageQs(p) : ''}`, true); if (r.status !== 200 || !r.json) throw failure(r);
  return { Data: Array.isArray(r.json.Data) ? r.json.Data : [], PaymentTypes: r.json.PaymentTypes ?? [], PaymentProviders: r.json.PaymentProviders ?? [], Total: Number(r.json.Total) || 0 };
}
export type Profile = { id?: number; email?: string; vendor?: string; balance: number; rating: number; frozen_balance?: number; default_forwarding_number?: string; default_country?: { name?: string; iso?: string; prefix?: string }; default_operator?: { name?: string }; total_active_orders_count?: number };
/** GET /user/profile : solde et note du compte revendeur (une note à 0 bloque les achats 24 h : « not enough rating »). */
export async function profile(): Promise<Profile> { const r = await call('/user/profile', true); if (r.status === 200 && r.json && typeof r.json.balance === 'number') return r.json; throw failure(r); }
export type Page = { limit?: number; offset?: number; order?: string; reverse?: boolean };
const pageQs = (p: Page) => { const q = new URLSearchParams(); if (p.limit !== undefined) q.set('limit', String(p.limit)); if (p.offset !== undefined) q.set('offset', String(p.offset)); if (p.order) q.set('order', p.order); if (p.reverse !== undefined) q.set('reverse', String(p.reverse)); return q.toString(); };
/** GET /user/orders?category=activation|hosting&limit&offset&order&reverse : historique des commandes chez 5sim. */
export async function orders(category: 'activation' | 'hosting', p: Page = {}): Promise<{ Data: P5Order[]; ProductNames: unknown[]; Statuses: unknown[]; Total: number }> {
  const r = await call(`/user/orders?category=${category}${pageQs(p) ? '&' + pageQs(p) : ''}`, true); if (r.status !== 200 || !r.json) throw failure(r);
  return { Data: Array.isArray(r.json.Data) ? r.json.Data.filter(isOrder) : [], ProductNames: r.json.ProductNames ?? [], Statuses: r.json.Statuses ?? [], Total: Number(r.json.Total) || 0 };
}
/** Retrouver un achat dont la réponse s'est perdue (délai dépassé). */
export async function recentOrders(limit = 10): Promise<P5Order[]> { return (await orders('activation', { limit, offset: 0, order: 'id', reverse: true })).Data; }
/** GET /guest/prices?country=… et GET /guest/prices : prix de tous les produits d'un pays, ou de tout le catalogue. */
export async function pricesByCountry(country: string) { const r = await call(`/guest/prices?country=${encodeURIComponent(country)}`, false); if (r.status === 400 && /country is incorrect/i.test(r.text)) return null; if (r.status !== 200 || !r.json) throw failure(r); return r.json as Record<string, Record<string, Record<string, { cost: number; count: number; rate?: number }>>>; }
export async function pricesAll() { const r = await call('/guest/prices', false); if (r.status !== 200 || !r.json) throw failure(r); return r.json as Record<string, Record<string, Record<string, { cost: number; count: number; rate?: number }>>>; }

/** Code reçu : champ « code » du SMS (5sim l'extrait), sinon premier nombre plausible du texte (WhatsApp : « 123-456 »). */
export function extractCode(o: Pick<P5Order, 'sms'>): { code: string; text: string } | null {
  const s = (o.sms ?? []).find(x => (x?.code ?? '').trim() || (x?.text ?? '').trim()); if (!s) return null;
  const text = String(s.text ?? '').slice(0, 200); const direct = String(s.code ?? '').trim();
  const m = direct || text.match(/(?<!\d)(\d{3}[- ]\d{3}|\d{4,8})(?!\d)/)?.[1] || '';
  return { code: m.replace(/[\s-]/g, ''), text };   // « 123-456 » → « 123456 » : WhatsApp accepte les chiffres seuls
}
