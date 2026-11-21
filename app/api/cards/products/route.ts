import { fromUnits, toUnits } from '@/lib/money';
import { guard } from '@/lib/cards/http';
import { products } from '@/lib/cards/catalog';
import { cardSettings, markupOf } from '@/lib/cards/settings';
// Prix affichés = prix du prestataire + notre marge, jamais le tarif du prestataire seul.
export const GET = guard(async () => {
  const s = await cardSettings();
  return Response.json({ products: (await products()).map(p => { const min = toUnits(p.min_opening_balance ?? 0);
    return { code: p.code, title: p.title ?? 'Carte virtuelle', bin: p.card_bin, brand: p.card_brand, requiresKyc: !!p.requires_kyc, minOpening: p.min_opening_balance, rechargeMin: p.recharge_min_limit ?? null,
      issueTotalAtMin: fromUnits(toUnits(p.issue_total ?? 0) + markupOf(s, 'issue', min)), cardholderFees: p.cardholder_fees ?? null, limits: p.limits ?? null }; }) });
});
