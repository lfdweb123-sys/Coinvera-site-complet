import { getSettings } from '@/lib/settings';
export async function GET() {
  const s = await getSettings();
  return Response.json({ platformFeeBps: s.platformFeeBps, processingFeeBps: s.processingFeeBps, apiActivationUsd: s.apiActivationUsd, pluginPriceUsd: s.pluginPriceUsd, freeTrials: s.freeTrials, minWithdrawalUsd: s.minWithdrawalUsd });
}
