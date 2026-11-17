import { db } from './firebase-admin';
export const DEFAULTS = { platformFeeBps: 150, processingFeeBps: 150, apiActivationUsd: 50, pluginPriceUsd: 50,
  minWithdrawalUsd: 10, withdrawalFeeTRX: 1, withdrawalFeeETH: 5, withdrawalFeeBSC: 1, maxWithdrawalUsd: 5000, freeTrials: 2, maxLicenseActivations: 1, pluginVersion: '0.1.0', chains: { USDT: ['TRX', 'ETH', 'BSC'] } as Record<string, string[]> };
export async function getSettings() {
  // Si Firestore est injoignable (ex. build sans identifiants), on retombe sur les valeurs par defaut.
  try { const s = await db.doc('admin_settings/pricing').get(); return { ...DEFAULTS, ...(s.data() ?? {}) }; }
  catch { return { ...DEFAULTS }; }
}
