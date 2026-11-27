import { liveRate } from '../fiat/rates';
import { getSettings } from '../settings';
import { availability, countries, FivesimError, Service, SERVICES } from './fivesim';
// Catalogue public : TOUS les pays que 5sim propose pour le service, avec le nombre de numéros libres, le taux de réception réel du code et le détail par opérateur.
// Rien n'est filtré : un pays apparaît dès qu'il a au moins un numéro disponible, et disparaît quand il n'y en a plus (données mises en cache 5 minutes).
const fr = (() => { try { return new Intl.DisplayNames(['fr'], { type: 'region' }); } catch { return null; } })();
export const countryName = (iso: string, fallback: string) => { try { return (iso && fr?.of(iso)) || fallback; } catch { return fallback; } };
export type CatalogCountry = { slug: string; iso: string; name: string; count: number; rate: number | null; operators: { name: string; count: number; rate: number | null }[] };
export async function catalog() {
  const [list, s] = await Promise.all([countries(), getSettings()]);
  const out: Record<string, CatalogCountry[]> = {};
  for (const svc of Object.keys(SERVICES) as Service[]) {
    const av = await availability(svc);
    out[svc] = list.filter(c => av[c.slug]).map(c => ({ slug: c.slug, iso: c.iso, name: countryName(c.iso, c.name), count: av[c.slug].count, rate: av[c.slug].rate,
      operators: Object.entries(av[c.slug].operators).map(([name, o]) => ({ name, count: o.count, rate: o.rate })).sort((a, b) => b.count - a.count) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }
  const priceXof = Number((s as any).numbersPriceXof) || 8500; let usd: number | null = null; try { usd = Math.ceil((priceXof * 1e6) / (await liveRate('XOF'))) / 1e6; } catch {}
  return { services: Object.entries(SERVICES).map(([key, v]) => ({ key, label: v.label })), countries: out, price: { xof: priceXof, usd } };
}
export const isProviderError = (e: unknown) => e instanceof FivesimError || (e as any)?.code === 'numbers_unavailable';
