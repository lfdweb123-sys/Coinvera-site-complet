import { warn } from './log';
let cache: { t: number; d: Record<string, number> } | null = null;
export async function priceUsd(cg: string): Promise<number> {
  if (!cache || Date.now() - cache.t > 60_000) {
    try { const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,binancecoin,litecoin,tron&vs_currencies=usd', { headers: process.env.COINGECKO_API_KEY ? { 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY } : {}, signal: AbortSignal.timeout(8000), cache: 'no-store' });
      if (!r.ok) throw new Error('http_' + r.status); const j = await r.json(); cache = { t: Date.now(), d: Object.fromEntries(Object.entries<any>(j).map(([k, v]) => [k, v.usd])) }; }
    catch (e) { warn('price.failed', { message: (e as Error).message }); if (!cache) throw new Error('quote_unavailable'); }
  }
  const p = cache!.d[cg]; if (!p) throw new Error('quote_unavailable'); return p;
}
