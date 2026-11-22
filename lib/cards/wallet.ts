import { ci, CORE } from './cryptoinfra';
// Portefeuille du programme de cartes : les adresses de paiement viennent du prestataire (GET /v1/cards/wallet, compte de la plateforme), jamais d'une variable locale.
// Un paiement direct de l'utilisateur arrive donc directement dans le portefeuille qui finance les cartes. Chaque dépôt y paie `recharge_fee_bps` (en points de base).
export type Prog = { bps: number; addresses: Record<string, string>; chargeUnits: Record<string, number> };
const MAP: Record<string, string> = { usdt_trc20: 'usdttrc20', usdt_bep20: 'usdtbsc' };
let cache: { t: number; p: Prog } | null = null;
async function trc20Charge(): Promise<number> {
  const fallback = Math.round((Number(process.env.CARDS_TRC20_CHARGE_USD) || 2) * 1e6);
  try { const q = (await ci('GET', '/v1/withdrawal-fee-quote', { query: { asset_id: 'usdt_trc20' }, timeoutMs: 8000 })).data; const v = Number(q?.total_fee); return Number.isFinite(v) && v >= 0 ? Math.min(Math.ceil(v * 1e6), 5_000_000) : fallback; } catch { return fallback; }
}
export async function programme(): Promise<Prog> {
  if (cache && Date.now() - cache.t < 60_000) return cache.p;
  const d = (await ci('GET', '/v1/cards/wallet')).data ?? {};
  const w = ((d.wallets ?? []) as any[]).find(x => String(x.core_id ?? '').toLowerCase() === CORE().toLowerCase() && x.held), addresses: Record<string, string> = {};
  for (const a of (w?.addresses ?? []) as any[]) if (a?.address && MAP[a.asset_id]) addresses[MAP[a.asset_id]] = String(a.address);
  if (!w && d.address && String(d.wallets?.[0]?.core_id ?? CORE()).toLowerCase() === CORE().toLowerCase() && d.asset_id === 'usdt_trc20') addresses.usdttrc20 = String(d.address);   // anciens champs : premier portefeuille ouvert
  // Un dépôt USDT TRC20 paie en plus le « network charge » du prestataire (coût réseau en direct + part fixe) : on le provisionne à partir du devis réseau en direct, plafonné, pour que le net reçu couvre toujours le prix.
  const chargeUnits: Record<string, number> = {};
  if (((w?.recharge_network_charge ?? []) as string[]).includes('usdt_trc20')) chargeUnits.usdttrc20 = await trc20Charge();
  const p = { chargeUnits, bps: Math.max(0, Math.min(2000, Number(w?.recharge_fee_bps ?? 0) || 0)), addresses }; cache = { t: Date.now(), p }; return p;
}
// Montant à envoyer pour que le portefeuille reçoive `units` nets des frais de dépôt du prestataire (arrondi au supérieur).
export const grossUp = (units: number, bps: number) => Math.ceil((units * 10000) / (10000 - bps));
export const netOf = (units: number, bps: number) => Math.floor((units * (10000 - bps)) / 10000);

