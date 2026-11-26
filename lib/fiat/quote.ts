import { toUnits } from '../money';
// Conversion USD -> monnaie locale des paiements FeexPay (mobile money et virements bancaires), pour les cartes virtuelles et Pro uniquement.
// Principe : l'utilisateur reçoit EXACTEMENT le montant en dollars qu'il demande ; on lui facture en monnaie locale de quoi couvrir, même dans le pire cas :
//   - le montant en dollars + notre marge (en % + un gain minimum fixe),
//   - les frais retenus par FeexPay sur l'encaissement,
//   - un coussin de change (la monnaie locale peut perdre de la valeur entre l'encaissement et la conversion en dollars ; couvre aussi l'écart de conversion).
// Garantie démontrée dans tests/fiat.test.ts : (local × (1 − frais)) / (taux × (1 + coussin)) >= dollars + marge, donc jamais de perte tant que les frais saisis sont ceux de FeexPay.
export type FiatCur = 'XOF' | 'NGN';
export const FIAT_DEFAULTS = { enabled: false, marginBps: 250, minGainUsd: 0.25, feeBps: 300, bufferXofBps: 150, bufferNgnBps: 500, floorXof: 0, floorNgn: 0, depositMin: 5, depositMax: 2500 };
export type FiatSettings = typeof FIAT_DEFAULTS;
export const FIAT_LIMITS = { marginBps: [0, 3000], minGainUsd: [0, 50], feeBps: [0, 2000], bufferXofBps: [0, 3000], bufferNgnBps: [0, 3000], floorXof: [0, 100000], floorNgn: [0, 1_000_000], depositMin: [1, 1000], depositMax: [5, 10000] } as const;
export const bufferOf = (s: FiatSettings, c: FiatCur) => (c === 'XOF' ? s.bufferXofBps : s.bufferNgnBps);
// Taux appliqué = le plus élevé entre le taux du marché et le plancher fixé par l'administrateur (garde-fou si une source de taux se trompait).
export const effectiveRate = (live: number, s: FiatSettings, c: FiatCur) => Math.max(live, c === 'XOF' ? s.floorXof : s.floorNgn);
const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;
/** Unités (1e-6 USD) que le montant local doit couvrir : dollars demandés + marge % + gain minimum fixe. */
export const needUnits = (usdUnits: number, s: FiatSettings) => usdUnits + Math.ceil((usdUnits * s.marginBps) / 10_000) + toUnits(s.minGainUsd);
/** Montant à payer en monnaie locale (entier, arrondi au supérieur). rate = unités locales pour 1 USD. */
export function quoteLocal(usdUnits: number, rate: number, s: FiatSettings, c: FiatCur): number {
  if (!(rate > 0) || !Number.isFinite(rate) || !(usdUnits > 0)) throw new Error('bad_quote_input');
  if (s.feeBps >= 10_000) throw new Error('bad_fee');
  const need = BigInt(needUnits(usdUnits, s)), rateMicro = BigInt(Math.round(rate * 1e6)), buf = BigInt(10_000 + bufferOf(s, c)), net = BigInt(10_000 - s.feeBps);
  // local = need/1e6 × rate × (1 + coussin) / (1 − frais)
  return Number(ceilDiv(need * rateMicro * buf, 1_000_000_000_000n * net));
}
/** Gain estimé en USD (au taux du marché, après frais FeexPay, sans le coussin) : pour l'affichage admin. */
export const gainEstimateUsd = (local: number, marketRate: number, feeBps: number, usdUnits: number) => (local * (1 - feeBps / 10_000)) / marketRate - usdUnits / 1e6;
export const fmtLocal = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
