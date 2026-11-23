import { bybitConfigured, coinInfo } from './bybit';
import { priceUsd } from './price';
import { warn } from './log';
import { type PayoutOpt } from './payout-options';
// Frais de retrait Bybit EN DIRECT (par pièce et par réseau), facturés à l'utilisateur : il paie ce que Bybit nous prélève, ni plus ni moins (arrondi au centime supérieur).
// Les frais Bybit changent avec le réseau : on les relit toutes les 10 minutes. Si Bybit est injoignable ou ne renvoie pas le réseau, on retombe sur le tarif de secours
// (réglage admin « withdrawalFee<ID> » ou valeur par défaut de l'option), qui est volontairement prudent (plutôt au-dessus du tarif Bybit habituel).
const TTL = 10 * 60_000, cache = new Map<string, { t: number; fees: Record<string, number> }>();   // coin -> chaîne Bybit -> frais en unités de la pièce
async function chainFees(coin: string): Promise<Record<string, number>> {
  const c = cache.get(coin); if (c && Date.now() - c.t < TTL) return c.fees;
  const r = await coinInfo(coin); if (r.retCode !== 0) throw new Error('bybit_' + r.retCode);
  const fees: Record<string, number> = {};
  for (const row of (r.result?.rows ?? []) as any[]) for (const ch of (row.chains ?? []) as any[]) { const f = Number(ch.withdrawFee); if (ch.chain && Number.isFinite(f) && f >= 0) fees[String(ch.chain).toUpperCase()] = f; }
  cache.set(coin, { t: Date.now(), fees }); return fees;
}
export type FeeInfo = { usd: number; live: boolean };
export async function withdrawFeeUsd(o: PayoutOpt, fallbackUsd: number): Promise<FeeInfo> {
  try {
    if (!bybitConfigured()) return { usd: fallbackUsd, live: false };
    const f = (await chainFees(o.coin))[o.chain.toUpperCase()]; if (f === undefined) return { usd: fallbackUsd, live: false };
    const usd = o.cg ? f * await priceUsd(o.cg) : f;                    // USDT / USDC : 1 pièce = 1 $ ; sinon conversion au cours
    return { usd: Math.ceil(usd * 100) / 100, live: true };
  } catch (e) { warn('bybit.fee_fallback', { coin: o.coin, chain: o.chain, message: (e as Error).message }); return { usd: fallbackUsd, live: false }; }
}
