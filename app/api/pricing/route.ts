import { getSettings } from '@/lib/settings';
import { PAYOUT_OPTS, feeOf } from '@/lib/payout-options';
import { withdrawFeeUsd } from '@/lib/bybit-fees';
export async function GET() {
  const s = await getSettings();
  return Response.json({ platformFeeBps: s.platformFeeBps, processingFeeBps: s.processingFeeBps, apiActivationUsd: s.apiActivationUsd, freeTrials: s.freeTrials, minWithdrawalUsd: s.minWithdrawalUsd, fees: Object.fromEntries(await Promise.all(PAYOUT_OPTS.map(async o => [o.id, (await withdrawFeeUsd(o, feeOf(s as any, o))).usd]))) });
}
