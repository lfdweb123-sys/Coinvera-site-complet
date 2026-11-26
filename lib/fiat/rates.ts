import { HttpError } from '../auth';
import { warn } from '../log';
import type { FiatCur } from './quote';
// Taux de change USD -> XOF / NGN. Deux sources indépendantes ; on retient le taux le plus élevé (plus de monnaie locale par dollar = plus prudent pour nous).
// Un taux hors des bornes est écarté (source défaillante). Cache 10 min ; en cas de panne, le dernier taux reste utilisable 60 min, au-delà on refuse plutôt que de deviner.
export const BOUNDS: Record<FiatCur, [number, number]> = { XOF: [300, 1500], NGN: [200, 20000] };
const SOURCES = ['https://open.er-api.com/v6/latest/USD', 'https://api.exchangerate-api.com/v4/latest/USD'];
export function parseRates(j: any): Partial<Record<FiatCur, number>> {
  const out: Partial<Record<FiatCur, number>> = {}; const r = j?.rates ?? j?.conversion_rates ?? {};
  for (const c of ['XOF', 'NGN'] as FiatCur[]) { const v = Number(r[c]); if (Number.isFinite(v) && v >= BOUNDS[c][0] && v <= BOUNDS[c][1]) out[c] = v; }
  return out;
}
export const mergeRates = (list: Partial<Record<FiatCur, number>>[]): Partial<Record<FiatCur, number>> => {
  const out: Partial<Record<FiatCur, number>> = {};
  for (const c of ['XOF', 'NGN'] as FiatCur[]) { const v = list.map(x => x[c]).filter((x): x is number => typeof x === 'number'); if (v.length) out[c] = Math.max(...v); }
  return out;
};
let cache: { t: number; r: Partial<Record<FiatCur, number>> } | null = null;
export async function liveRate(c: FiatCur): Promise<number> {
  if (!cache || Date.now() - cache.t > 600_000) {
    const got = await Promise.allSettled(SOURCES.map(async u => { const r = await fetch(u, { signal: AbortSignal.timeout(6000), cache: 'no-store' }); if (!r.ok) throw new Error('http_' + r.status); return parseRates(await r.json()); }));
    const ok = got.flatMap(g => (g.status === 'fulfilled' ? [g.value] : []));
    if (ok.length) cache = { t: Date.now(), r: { ...(cache?.r ?? {}), ...mergeRates(ok) } };
    else warn('fiat.rates_failed', { reasons: got.map(g => (g.status === 'rejected' ? String(g.reason?.message ?? g.reason) : '')).join(',') });
  }
  const v = cache?.r[c]; if (!v || Date.now() - cache!.t > 3_600_000) throw new HttpError(503, 'fx_unavailable');
  return v;
}
export const _resetRates = () => { cache = null; };
