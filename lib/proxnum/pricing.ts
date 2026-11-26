import { bps, fromUnits, SCALE } from '../money';
import { codeOf, isOk, px, PxError } from './api';
// Prix fiable côté serveur (jamais celui envoyé par le navigateur) : prix revendeur ProxNum + marge Coinvera.
// Marge réglable par variables d'environnement : PROXNUM_MARKUP_BPS (points de base, défaut 20000 = +200 %, soit 3 × le prix ProxNum) et PROXNUM_MARKUP_FLAT_USD (défaut 0).
const num = (v: string | undefined, d: number) => { const n = Number(v); return v !== undefined && v !== '' && Number.isFinite(n) && n >= 0 ? n : d; };
const pos = (v: string | undefined, d: number) => { const n = num(v, d); return n > 0 ? n : d; };   // 0 n'est jamais une marge valide : vendre au prix coûtant n'est pas voulu, la marge par défaut (3 ×) s'applique
export const markup = () => ({ bps: Math.min(pos(process.env.PROXNUM_MARKUP_BPS, 20_000), 100_000), flatUnits: Math.round(Math.min(num(process.env.PROXNUM_MARKUP_FLAT_USD, 0), 100) * SCALE) });
// Prix ProxNum (USD, décimal) -> unités entières 1e-6 USD, arrondi au-dessus : jamais de perte sur l'arrondi.
export const costUnits = (usd: number | string) => { const n = Number(usd); if (!Number.isFinite(n) || n <= 0) throw new PxError(502, 'provider_unreachable'); return Math.ceil(n * SCALE - 1e-6); };
export const chargeOf = (cost: number) => { const m = markup(); return cost + bps(cost, m.bps) + m.flatUnits; };
export const priceView = (cost: number) => fromUnits(chargeOf(cost));

// ---- Libellés (jamais le nom d'un fournisseur amont) ----
// Seuls les services dont le vrai nom est connu sont proposés : un service identifié par son seul code n'est jamais affiché.
const SERVICES: Record<string, string> = { ig: 'Instagram', wa: 'WhatsApp', tg: 'Telegram', go: 'Google / Gmail', fb: 'Facebook', tw: 'Twitter / X', ds: 'Discord', lf: 'TikTok', ub: 'Uber', ts: 'PayPal', am: 'Amazon', mm: 'Microsoft', vk: 'VKontakte', ya: 'Yandex', ok: 'Odnoklassniki', wb: 'WeChat' };
export const knownService = (c: string) => c in SERVICES;
export const serviceName = (c: string) => SERVICES[c] ?? c.toUpperCase();
// Nom fourni par ProxNum pour une location : retenu seulement s'il s'agit d'un vrai nom (pas vide, pas le code lui-même).
export const realName = (code: string, name: unknown) => { const n = String(name ?? '').trim(); return n && n.toLowerCase() !== code.toLowerCase() ? n : SERVICES[code] ?? null; };
// Identifiants de pays canoniques (paramètre country de l'API). Pour les pays absents de cette liste, la page des codes pays ProxNum fait foi : « Pays n° X ».
const COUNTRIES: Record<string, string> = { '0': 'Russie', '1': 'Ukraine', '2': 'Kazakhstan', '3': 'Chine', '4': 'Philippines', '5': 'Myanmar', '6': 'Indonésie', '7': 'Malaisie', '8': 'Kenya', '10': 'Vietnam', '12': 'États-Unis', '15': 'Pologne', '16': 'Royaume-Uni', '19': 'Nigeria', '22': 'Inde', '31': 'Afrique du Sud', '33': 'Colombie', '36': 'Canada', '37': 'Maroc', '38': 'Ghana', '43': 'Allemagne', '52': 'Thaïlande', '54': 'Mexique', '56': 'Espagne', '62': 'Turquie', '73': 'Brésil', '78': 'France', '86': 'Italie', '187': 'États-Unis' };
export const countryName = (id: string, fromApi?: string) => fromApi || COUNTRIES[id] || `Pays n° ${id}`;

// ---- Numéros virtuels ----
export type Option = { token: string; label: string; price: string; count: number | null; recommended: boolean };
// Devis d'un numéro virtuel (GET /resell/price). Multi-route : price_options[] est lue et ses libellés sont affichés tels quels.
export async function virtualQuote(service: string, country: number, token?: string) {
  const r = await px('GET', '/resell/price', { query: { service, country } });
  if (r.status >= 400 || r.j.sell_price == null) throw new PxError(409, r.status >= 400 && codeOf(r) !== 'provider_error' ? codeOf(r) : 'no_numbers');
  const opts: any[] = Array.isArray(r.j.price_options) ? r.j.price_options.filter((o: any) => o?.token && o.sell_price != null) : [];
  let cost = costUnits(r.j.sell_price), send: string | undefined;
  if (token && token !== 'auto') { const o = opts.find(x => x.token === token); if (!o) throw new PxError(409, 'price_changed'); cost = costUnits(o.sell_price); send = token; }
  const rec = r.j.recommended_token ?? opts.find(o => o.is_best)?.token;
  const options: Option[] = opts.map(o => ({ token: String(o.token), label: String(o.label ?? 'Route'), price: priceView(costUnits(o.sell_price)), count: o.count ?? null, recommended: o.token === rec }));
  return { costUnits: cost, chargeUnits: chargeOf(cost), token: send, price: priceView(cost), options };
}
let countriesCache: { at: number; v: { id: string; name: string }[] } | null = null, namesCache: { at: number; v: Record<string, string> } | null = null;
export const _resetCaches = () => { countriesCache = null; namesCache = null; };
// Noms de pays fournis par ProxNum (catalogue de location, mêmes identifiants que le paramètre country) : complètent la liste Coinvera. Meilleur effort : en cas d'échec, seule la liste Coinvera est utilisée.
async function apiNames() {
  if (namesCache && Date.now() - namesCache.at < 3_600_000) return namesCache.v;
  const v: Record<string, string> = {};
  try { const r = await px('GET', '/resell/rental/catalog'); if (isOk(r)) for (const c of r.j.countries ?? []) if (c?.id != null && c?.name) v[String(c.id)] = String(c.name); } catch { /* on garde la liste Coinvera */ }
  namesCache = { at: Date.now(), v }; return v;
}
// Pays proposant au moins un service (au nom connu) disponible (GET /prices, mis en cache 5 min). Un pays dont le vrai nom est inconnu n'est jamais proposé.
export async function virtualCountries() {
  if (countriesCache && Date.now() - countriesCache.at < 300_000) return countriesCache.v;
  const r = await px('GET', '/prices'); if (!isOk(r) || typeof r.j.prices !== 'object') throw new PxError(502, 'provider_unreachable');
  const names = await apiNames();
  const v = Object.entries(r.j.prices as Record<string, Record<string, any>>).filter(([id, s]) => (COUNTRIES[id] || names[id]) && Object.entries(s ?? {}).some(([c, x]) => knownService(c) && Number(x?.available) > 0)).map(([id]) => ({ id, name: COUNTRIES[id] ?? names[id] })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  countriesCache = { at: Date.now(), v }; return v;
}
export async function virtualServices(country: number) {
  const r = await px('GET', '/prices', { query: { country } }); if (!isOk(r) || typeof r.j.prices !== 'object') throw new PxError(502, 'provider_unreachable');
  const s = (r.j.prices[String(country)] ?? {}) as Record<string, any>;
  return Object.entries(s).filter(([c, x]) => knownService(c) && Number(x?.available) > 0 && Number(x?.sell_price) > 0).map(([code, x]) => ({ code, name: serviceName(code), price: priceView(costUnits(x.sell_price)), available: Number(x.available) })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

// ---- Locations ----
// Catalogue de location (GET /resell/rental/catalog) : les durées viennent toujours de durations[] (jamais codées en dur).
export async function rentalCatalog(country?: string, hours?: number) {
  const r = await px('GET', '/resell/rental/catalog', { query: { country, hours } });
  if (!isOk(r)) throw new PxError(r.status >= 400 && r.status < 500 ? r.status : 502, codeOf(r) === 'provider_error' ? 'provider_unreachable' : codeOf(r));
  const j = r.j;
  return { country: String(j.country ?? ''), hours: Number(j.hours ?? 0), cancelWindowSeconds: Number(j.cancel_window_seconds ?? 120),
    durations: (j.durations ?? []).map((d: any) => ({ hours: Number(d.hours), label: String(d.label ?? `${d.hours} h`) })),
    countries: (j.countries ?? []).filter((c: any) => c?.id != null && (COUNTRIES[String(c.id)] || String(c.name ?? '').trim())).map((c: any) => ({ id: String(c.id), name: countryName(String(c.id), c.name) })),
    services: (j.services ?? []).filter((s: any) => Number(s?.price) > 0 && realName(String(s.code), s.name)).map((s: any) => ({ code: String(s.code), name: realName(String(s.code), s.name)!, price: priceView(costUnits(s.price)), stock: Number(s.stock ?? 0), costUnits: costUnits(s.price), providerPrice: Number(s.price) })) };
}
