import { guard } from '@/lib/scarab/http';
import { visibleProducts } from '@/lib/scarab/catalog';
import { scarabSettings, pricingOf } from '@/lib/scarab/settings';
import { categoryOf, customerFee, centsToUsd } from '@/lib/scarab/pricing';
// Prix affichés = tarif Starter + notre marge (prix fixes, indépendants du plan ScarabPay). Jamais le tarif du prestataire seul.
export const GET = guard(async () => {
  const s = await scarabSettings(); const pr = pricingOf(s);
  return Response.json({ products: (await visibleProducts()).map(p => { const min = Number(p.min_initial_load_minor ?? 500), cat = categoryOf(p.name ?? '');
    return { id: p.id, name: p.name ?? 'Carte Pro', description: p.description ?? '', platinum: cat === 'platinum', currency: p.currency ?? 'USD', minInitial: centsToUsd(min), maxInitial: p.max_initial_load_minor ? centsToUsd(Number(p.max_initial_load_minor)) : null,
      minRecharge: centsToUsd(Math.max(200, Number(p.min_recharge_minor ?? 0))), maxBalance: Number(p.max_balance_minor ?? 0) ? centsToUsd(Number(p.max_balance_minor)) : null,
      issueTotalAtMin: centsToUsd(min + customerFee('issue', cat, min, pr.issue)), issueFeeAtMin: centsToUsd(customerFee('issue', cat, min, pr.issue)), rechargeFeeAt100: centsToUsd(customerFee('topup', cat, 10000, pr.topup)) }; }) });
});
