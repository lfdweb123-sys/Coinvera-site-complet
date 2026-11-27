import { bps, fromUnits, SCALE } from '../money';
import { es, EsError, isOk } from './api';
import { daysLabel, gbLabel, norm, planGb } from './format';
import { regionOf } from './regions';
// Catalogue des forfaits eSIM (POST /package/list) : mis en cache 10 minutes (dernier catalogue connu conservé si le prestataire est en panne).
// Les prix envoyés au navigateur sont TOUJOURS recalculés côté serveur : prix du prestataire + marge Coinvera, arrondi au cent supérieur. Aucun identifiant ni nom de prestataire n'est exposé.
const num = (v: string | undefined, d: number) => { const n = Number(v); return v !== undefined && v !== '' && Number.isFinite(n) && n >= 0 ? n : d; };
const pos = (v: string | undefined, d: number) => { const n = num(v, d); return n > 0 ? n : d; };   // 0 n'est jamais une marge valide : la marge par défaut s'applique
// Marge réglable : ESIM_MARKUP_BPS (points de base, défaut 3000 = +30 %) et ESIM_MARKUP_FLAT_USD (montant fixe, défaut 0).
export const markup = () => ({ bps: Math.min(pos(process.env.ESIM_MARKUP_BPS, 3000), 100_000), flatUnits: Math.round(Math.min(num(process.env.ESIM_MARKUP_FLAT_USD, 0), 100) * SCALE) });
// Prix du prestataire (10000 = 1,00 USD) -> unités entières 1e-6 USD.
export const costUnits = (providerPrice: number | string) => { const n = Number(providerPrice); if (!Number.isFinite(n) || n <= 0) throw new EsError(502, 'provider_unreachable'); return Math.round(n * (SCALE / 10_000)); };
export const chargeOf = (cost: number) => { const m = markup(); return Math.ceil((cost + bps(cost, m.bps) + m.flatUnits) / 10_000) * 10_000; };   // arrondi au cent supérieur : prix lisibles, jamais de perte

// ---- Noms de pays en français ----
const OVERRIDE: Record<string, string> = { 'GB-ENG': 'Angleterre', 'GB-SCT': 'Écosse', 'GB-WLS': 'Pays de Galles', 'GB-NIR': 'Irlande du Nord', TRNC: 'Chypre du Nord', 'WS-S': 'Samoa' };
const names = new Map<string, string>(); let dn: Intl.DisplayNames | null = null;
export const nameOf = (code: string) => {
  let v = names.get(code); if (v) return v;
  try { dn ??= new Intl.DisplayNames(['fr'], { type: 'region' }); v = OVERRIDE[code] ?? (/^[A-Z]{2}$/.test(code) ? dn.of(code) : undefined); } catch { /* code inconnu */ }
  v = v && v !== code ? v : code; names.set(code, v); return v;
};

export type Plan = { daily: boolean; ruleCode: string | null; slug: string; code: string; name: string; title: string; scope: 'country' | 'regional' | 'global'; locations: string[]; regionIds: string[]; bytes: number; days: number; speed: string; networks: string[]; sms: boolean; fup: string | null; activeType: number; providerPrice: number; costUnits: number; chargeUnits: number; search: string };
const GLOBAL_FROM = 60;   // un forfait couvrant 60 zones ou plus est « mondial »
const daysOf = (d: unknown, unit: unknown) => { const n = Math.max(1, Math.round(Number(d) || 0)), u = String(unit ?? 'DAY').toUpperCase(); return u === 'MONTH' ? n * 30 : u === 'YEAR' ? n * 365 : n; };
// Titre d'un forfait régional : nom du prestataire privé de son volume et de sa durée (« Asia 11 countries 1GB 30 Days » -> « Asia 11 countries »).
const cleanTitle = (n: string) => { const t = n.replace(/\s*\d+(?:\.\d+)?\s*(?:GB|MB|TB)\b.*$/i, '').trim(); return t || n.trim(); };
// dataType : 1 = volume total ; 2, 3, 4 = forfaits « par jour » (day pass : volume quotidien, durée choisie à l'achat, de 1 à 365 jours). `lenient` : recharges, dont la zone peut ne pas être renseignée.
export function normalize(p: any, lenient = false): Plan | null {
  const slug = String(p?.slug || p?.packageCode || '').trim(); if (!/^[A-Za-z0-9_.\-]{1,64}$/.test(slug)) return null;
  const dt = Number(p.dataType ?? 1); if (![1, 2, 3, 4].includes(dt)) return null; const daily = dt !== 1;
  const bytes = Number(p.volume) || 0, price = Number(p.price); if ((!(bytes > 0) && dt !== 4) || !(price > 0)) return null;   // le prix d'un forfait par jour est le prix d'UN jour
  const locations: string[] = [...new Set<string>(String(p.location ?? '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean))]; if (!locations.length && !lenient) return null;
  const scope = locations.length <= 1 ? 'country' : locations.length >= GLOBAL_FROM ? 'global' : 'regional', name = String(p.name ?? slug);
  const title = scope === 'country' && locations.length ? nameOf(locations[0]) : cleanTitle(name), cost = costUnits(price);
  const ops: string[] = []; for (const l of Array.isArray(p.locationNetworkList) ? p.locationNetworkList : []) for (const o of Array.isArray(l?.operatorList) ? l.operatorList : []) { const n = String(o?.operatorName ?? '').trim(); if (n && !ops.includes(n)) ops.push(n); }
  const regionIds = scope === 'global' ? [] : [...new Set(locations.map(regionOf).filter((x): x is string => !!x))];
  return { daily, ruleCode: p.discountRuleCode ? String(p.discountRuleCode).slice(0, 60) : null, slug, code: String(p.packageCode || slug), name, title, scope, locations, regionIds, bytes, days: daily ? 1 : daysOf(p.duration, p.durationUnit), speed: String(p.speed ?? '').slice(0, 20), networks: ops.slice(0, 6), sms: Number(p.smsStatus ?? 0) > 0, fup: p.fupPolicy ? String(p.fupPolicy).slice(0, 40) : null, activeType: Number(p.activeType ?? 1), providerPrice: price, costUnits: cost, chargeUnits: chargeOf(cost),
    search: norm([title, name, ...locations.map(nameOf), ...locations].join(' ')) };
}
type Dest = { code: string; name: string; region: string | null; from: string; plans: number; maxGb: string; daily: boolean };
type Group = { name: string; scope: 'regional' | 'global'; from: string; plans: number; countries: number };
type Cat = { at: number; plans: Plan[]; sum?: { destinations: Dest[]; groups: Group[] } };
let cat: Cat | null = null, inflight: Promise<Cat> | null = null;
export const _resetCatalog = () => { cat = null; inflight = null; };
const TTL = 10 * 60_000;
async function load(): Promise<Cat> {
  const r = await es('/package/list', { locationCode: '', type: 'BASE', packageCode: '', slug: '', iccid: '' }, { timeoutMs: 30_000 });
  const list = isOk(r) ? r.j?.obj?.packageList : null; if (!Array.isArray(list)) throw new EsError(502, 'provider_unreachable');
  const plans: Plan[] = []; for (const p of list) { try { const x = normalize(p); if (x) plans.push(x); } catch { /* forfait au prix invalide : ignoré */ } }
  return { at: Date.now(), plans };
}
export async function catalog(): Promise<Cat> {
  if (cat && Date.now() - cat.at < TTL) return cat;
  inflight ??= load().then(c => (cat = c)).finally(() => { inflight = null; });
  try { return await inflight; } catch (e) { if (cat) return cat; throw e; }   // panne du prestataire : dernier catalogue connu
}
// Forfait relu chez le prestataire au moment de l'achat (jamais le cache) : prix et disponibilité à jour.
export async function freshPlan(slug: string): Promise<Plan> {
  for (const k of ['slug', 'packageCode'] as const) {
    const r = await es('/package/list', { locationCode: '', type: 'BASE', packageCode: k === 'packageCode' ? slug : '', slug: k === 'slug' ? slug : '', iccid: '' });
    const list = isOk(r) ? r.j?.obj?.packageList : null; if (!Array.isArray(list)) throw new EsError(502, 'provider_unreachable');
    for (const p of list) { const x = (() => { try { return normalize(p); } catch { return null; } })(); if (x && (x.slug === slug || x.code === slug)) return x; }
  }
  throw new EsError(409, 'package_unavailable');
}

// Recharges proposées pour une eSIM précise (POST /package/list, type TOPUP + ICCID) : relues chez le prestataire, jamais mises en cache.
export async function freshTopups(iccid: string): Promise<Plan[]> {
  const r = await es('/package/list', { locationCode: '', type: 'TOPUP', packageCode: '', slug: '', iccid });
  const list = isOk(r) ? r.j?.obj?.packageList : null; if (!Array.isArray(list)) throw new EsError(502, 'provider_unreachable');
  const out: Plan[] = []; for (const p of list) { try { const x = normalize(p, true); if (x) out.push(x); } catch { /* recharge au prix invalide : ignorée */ } } return out;
}
export async function freshTopup(iccid: string, slug: string): Promise<Plan> { const p = (await freshTopups(iccid)).find(x => x.slug === slug || x.code === slug); if (!p) throw new EsError(409, 'topup_unavailable'); return p; }

// ---- Forfaits par jour : total = prix d'un jour x nombre de jours x ratio du palier (POST /discountRule/list) ----
type Rule = { tiers: { min: number; max: number; ratio: number }[] };
const rules = new Map<string, { at: number; v: Rule | null }>();
export const _resetRules = () => rules.clear();
async function ruleOf(code: string | null): Promise<Rule | null> {
  if (!code) return null; const c = rules.get(code); if (c && Date.now() - c.at < TTL) return c.v;
  const r = await es('/discountRule/list', { discountRuleCode: code }); const x = isOk(r) ? r.j?.obj?.list?.[0] : null, now = Date.now(); let v: Rule | null = null;
  const from = Date.parse(x?.validPeriod?.startTime ?? ''), to = Date.parse(x?.validPeriod?.endTime ?? '');
  if (x && Number(x.rewardType) === 20 && Array.isArray(x.periodRuleList) && !(from > now) && !(to < now)) v = { tiers: x.periodRuleList.map((t: any) => ({ min: Number(t.minDays), max: Number(t.maxDays), ratio: Number(t.payRatio) })).filter((t: any) => t.ratio > 0 && t.ratio <= 1 && t.max >= t.min) };
  rules.set(code, { at: now, v }); return v;
}
// Coût et prix de vente d'un forfait pour `days` jours. Un forfait à volume total ne dépend pas de la durée choisie.
export async function totalFor(p: Plan, days?: number) {
  if (!p.daily) return { costUnits: p.costUnits, chargeUnits: p.chargeUnits, days: p.days, ratio: 1 };
  if (!Number.isInteger(days) || (days as number) < 1 || (days as number) > 365) throw new EsError(422, 'invalid_period');
  const t = (await ruleOf(p.ruleCode))?.tiers.find(x => (days as number) >= x.min && (days as number) <= x.max), ratio = t?.ratio ?? 1, cost = Math.round(p.costUnits * (days as number) * ratio);
  return { costUnits: cost, chargeUnits: chargeOf(cost), days: days as number, ratio };
}

// ---- Vues envoyées au navigateur ----
export const planView = (p: Plan) => ({ id: p.slug, title: p.title, scope: p.scope, locations: p.locations.slice(0, 8).map(c => ({ code: c, name: nameOf(c) })), locationCount: p.locations.length, bytes: p.bytes, daily: p.daily, gb: planGb(p.bytes, p.daily), days: p.days, daysLabel: p.daily ? '1 à 365 jours' : daysLabel(p.days), speed: p.speed || null, networks: p.networks.slice(0, 3), sms: p.sms, fup: p.fup, activeType: p.activeType, price: fromUnits(p.chargeUnits) });
export type Filters = { q?: string; type?: string; scope?: string; region?: string; data?: string; days?: string; sort?: string; page: number; size: number };
const DATA: Record<string, [number, number]> = { le1: [0, 1], le3: [1, 3], le5: [3, 5], le10: [5, 10], gt10: [10, Infinity] };   // en Go, borne basse exclue
const DAYS: Record<string, [number, number]> = { le7: [0, 7], le15: [7, 15], le30: [15, 30], gt30: [30, Infinity] };
const ORDER = { country: 0, regional: 1, global: 2 };
const gbPrice = (p: Plan) => p.daily || !p.bytes ? Infinity : p.chargeUnits / p.bytes;   // le prix par Go n'a pas de sens pour un forfait par jour
export async function searchPlans(f: Filters) {
  const c = await catalog(), n = norm(f.q ?? ''), words = n ? n.split(' ') : [], d = DATA[f.data ?? ''], dd = DAYS[f.days ?? ''];
  const list = c.plans.filter(p => (!f.type || (f.type === 'daily') === p.daily) && (!f.scope || f.scope === 'all' || p.scope === f.scope) && (!f.region || p.regionIds.includes(f.region)) && (!d || (p.bytes / 2 ** 30 > d[0] && p.bytes / 2 ** 30 <= d[1])) && (!dd || (!p.daily && p.days > dd[0] && p.days <= dd[1])) && words.every(w => p.search.includes(w)));
  const rel = (p: Plan) => { if (!n) return 0; const t = norm(p.title); return t === n ? 0 : t.startsWith(n) ? 1 : p.scope === 'country' ? 2 : p.scope === 'regional' ? 3 : 4; };   // la destination recherchée d'abord, puis les forfaits régionaux qui la couvrent
  const price = (a: Plan, b: Plan) => a.chargeUnits - b.chargeUnits || a.title.localeCompare(b.title, 'fr');
  const sorters: Record<string, (a: Plan, b: Plan) => number> = { price_asc: price, price_desc: (a, b) => -price(a, b), data_desc: (a, b) => b.bytes - a.bytes || price(a, b), days_desc: (a, b) => b.days - a.days || price(a, b), per_gb: (a, b) => { const x = gbPrice(a), y = gbPrice(b); return x < y ? -1 : x > y ? 1 : price(a, b); } };
  list.sort(sorters[f.sort ?? ''] ?? ((a, b) => rel(a) - rel(b) || (n ? 0 : ORDER[a.scope] - ORDER[b.scope]) || a.title.localeCompare(b.title, 'fr') || a.bytes - b.bytes || a.days - b.days || a.chargeUnits - b.chargeUnits));
  const size = Math.min(50, Math.max(1, f.size)), page = Math.max(1, f.page);
  return { items: list.slice((page - 1) * size, page * size).map(planView), total: list.length, page, size, updatedAt: c.at };
}
// Résumé public : destinations (prix « à partir de ») et groupes régionaux / mondiaux. Aucun identifiant de forfait.
export async function summary() {
  const c = await catalog(); if (c.sum) return { ...c.sum, updatedAt: c.at };
  const dest = new Map<string, { p: Plan; n: number; max: number }>(), grp = new Map<string, { p: Plan; n: number; countries: number }>();
  const daily = new Set<string>(); for (const p of c.plans) if (p.daily && p.scope === 'country') daily.add(p.locations[0]);
  for (const p of c.plans) {
    if (p.daily) continue;                                                          // « dès X » ne mélange jamais un prix par jour et un prix de forfait
    if (p.scope === 'country') { const k = p.locations[0], e = dest.get(k); if (!e) dest.set(k, { p, n: 1, max: p.bytes }); else { e.n++; e.max = Math.max(e.max, p.bytes); if (p.chargeUnits < e.p.chargeUnits) e.p = p; } }
    else { const k = p.scope + '|' + p.title, e = grp.get(k); if (!e) grp.set(k, { p, n: 1, countries: p.locations.length }); else { e.n++; if (p.chargeUnits < e.p.chargeUnits) e.p = p; } }
  }
  const destinations: Dest[] = [...dest.entries()].map(([code, e]) => ({ code, name: nameOf(code), region: regionOf(code) ?? null, from: fromUnits(e.p.chargeUnits), plans: e.n, maxGb: gbLabel(e.max), daily: daily.has(code) })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const groups: Group[] = [...grp.values()].map(e => ({ name: e.p.title, scope: e.p.scope as 'regional' | 'global', from: fromUnits(e.p.chargeUnits), plans: e.n, countries: e.countries })).sort((a, b) => (a.scope === b.scope ? 0 : a.scope === 'global' ? 1 : -1) || a.name.localeCompare(b.name, 'fr'));
  c.sum = { destinations, groups }; return { ...c.sum, updatedAt: c.at };
}
