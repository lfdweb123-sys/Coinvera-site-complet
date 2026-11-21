import { getSettings } from '@/lib/settings';
import { PAYOUT_OPTS, feeOf } from '@/lib/payout-options';
export async function GET() {
  const s = await getSettings();
  return Response.json({ platformFeeBps: s.platformFeeBps, processingFeeBps: s.processingFeeBps, apiActivationUsd: s.apiActivationUsd, freeTrials: s.freeTrials, minWithdrawalUsd: s.minWithdrawalUsd, fees: Object.fromEntries(PAYOUT_OPTS.map(o => [o.id, feeOf(s as any, o)])) });
}
