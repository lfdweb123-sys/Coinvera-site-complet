import { db } from '../firebase-admin';
import { FIAT_DEFAULTS, FIAT_LIMITS, type FiatSettings } from './quote';
// Réglages des paiements FeexPay pour les cartes (collection à part). `enabled` est faux par défaut : rien n'est proposé tant que l'administrateur n'a pas activé le service.
export function sanitize(raw: Record<string, any> | undefined): FiatSettings {
  const out: any = { ...FIAT_DEFAULTS, enabled: raw?.enabled === true };
  for (const k of Object.keys(FIAT_LIMITS) as (keyof typeof FIAT_LIMITS)[]) { const v = Number(raw?.[k]); const [lo, hi] = FIAT_LIMITS[k]; if (raw?.[k] !== undefined && raw?.[k] !== '' && Number.isFinite(v)) out[k] = Math.min(hi, Math.max(lo, v)); }
  if (out.depositMin > out.depositMax) out.depositMin = out.depositMax;
  return out;
}
export async function fiatSettings(): Promise<FiatSettings> {
  try { return sanitize((await db.doc('fiat_settings/config').get()).data()); } catch { return { ...FIAT_DEFAULTS }; }
}
