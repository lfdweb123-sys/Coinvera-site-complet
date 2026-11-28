import { liveRate } from '../fiat/rates';
import { getSettings } from '../settings';
import { DOC_COUNTRIES } from './doc-countries';
import { availability, countries, FivesimError, flash, Service, SERVICES } from './fivesim';
// Catalogue public : TOUS les pays de la documentation 5sim (liste complète) plus ceux que /guest/countries ajouterait, avec le nombre de numéros libres, le taux de réception réel du code
// et le détail par opérateur. Rien n'est filtré : un pays sans numéro libre reste listé avec count = 0 (données de disponibilité mises en cache 5 minutes).
const fr = (() => { try { return new Intl.DisplayNames(['fr'], { type: 'region' }); } catch { return null; } })();
export const countryName = (iso: string, fallback: string) => { try { return (iso && fr?.of(iso)) || fallback; } catch { return fallback; } };
export type CatalogCountry = { slug: string; iso: string; name: string; count: number; available: boolean; rate: number | null; operators: { name: string; count: number; rate: number | null }[] };
/** Pays de la documentation + pays de l'API (l'API fait foi pour le code ISO et le nom anglais). */
export function mergeCountries(api: { slug: string; iso: string; name: string }[]) {
  const m = new Map<string, { slug: string; iso: string; name: string }>();
  for (const [slug, iso] of Object.entries(DOC_COUNTRIES)) m.set(slug, { slug, iso, name: slug });
  for (const c of api) m.set(c.slug, { slug: c.slug, iso: c.iso || m.get(c.slug)?.iso || '', name: c.name || c.slug });
  return [...m.values()];
}
export async function catalog() {
  const [api, s] = await Promise.all([countries().catch(() => []), getSettings()]);
  const list = mergeCountries(api);
  const out: Record<string, CatalogCountry[]> = {};
  for (const svc of Object.keys(SERVICES) as Service[]) {
    const av = await availability(svc);
    out[svc] = list.map(c => { const a = av[c.slug]; return { slug: c.slug, iso: c.iso, name: countryName(c.iso, c.name), count: a?.count ?? 0, available: !!a, rate: a?.rate ?? null,
      operators: Object.entries(a?.operators ?? {}).map(([name, o]) => ({ name, count: o.count, rate: o.rate })).sort((x, y) => y.count - x.count) }; })
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }
  const notice = await flash('en').catch(() => null);   // notification de 5sim (maintenance, avertissement), affichée telle quelle
  const priceXof = Number((s as any).numbersPriceXof) || 8500; let usd: number | null = null; try { usd = Math.ceil((priceXof * 1e6) / (await liveRate('XOF'))) / 1e6; } catch {}
  return { services: Object.entries(SERVICES).map(([key, v]) => ({ key, label: v.label })), countries: out, price: { xof: priceXof, usd }, notice };
}
export const isProviderError = (e: unknown) => e instanceof FivesimError || (e as any)?.code === 'numbers_unavailable';
