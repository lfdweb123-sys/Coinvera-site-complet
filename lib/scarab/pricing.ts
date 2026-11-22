// Prix fixes de la Virtuals cards pro.
//
// Principe : le prix facturé au client NE DÉPEND PAS de ton offre ScarabPay. Il vaut toujours
//   tarif Starter (le plus cher des quatre plans) + ta marge (Admin > Virtuals cards pro).
// Starter étant le plan le plus cher, passer à Growth, Scale ou Pro ne peut que baisser ton coût réel : ton gain par opération ne peut qu'augmenter.
// Garde-fou en plus : à chaque opération, le coût réel de ton plan actuel est relu (GET /products) ; si le prix facturé était un jour
// inférieur à ce coût (ScarabPay change ses tarifs), l'opération est refusée au lieu de te faire perdre de l'argent.
//
// Montants en centimes (« minor units », comme l'API). Formule ScarabPay : frais = fixe + max(montant × bps / 10 000, minimum), arrondi au centime supérieur.
export type FeeRule = { fixed: number; bps: number; min: number };
export type Kind = 'issue' | 'topup';
export type Category = 'standard' | 'platinum';

// Tarifs du plan Starter relevés le 2026-11-21 (page « Choose your plan » et écran de création de carte). À mettre à jour si ScarabPay les change.
export const STARTER: Record<Category, Record<Kind, FeeRule>> = {
  standard: { issue: { fixed: 150, bps: 100, min: 100 }, topup: { fixed: 75, bps: 100, min: 100 } },    // Virtual et Contactless : 1,50 $ + 1 % (min 1 $) ; 0,75 $ + 1 % (min 1 $)
  platinum: { issue: { fixed: 100, bps: 100, min: 100 }, topup: { fixed: 0, bps: 100, min: 50 } },      // Platinum : 1 $ + 1 % (min 1 $) ; 1 % (min 0,50 $)
};
// Plafond de la marge : évite une faute de frappe qui facturerait 1000 $ de frais.
export const MARGIN_MAX = { flat: 100, bps: 3000 };

export const categoryOf = (productName: string): Category => (/platinum/i.test(productName) ? 'platinum' : 'standard');
const ceilDiv = (a: number, b: number) => Math.floor((a + b - 1) / b);
export const feeOf = (r: FeeRule, amountMinor: number) => r.fixed + Math.max(ceilDiv(amountMinor * r.bps, 10_000), r.min);

export type Margin = { flatMinor: number; bps: number };
export type Pricing = { issue: Margin; topup: Margin };
export const customerFee = (kind: Kind, cat: Category, amountMinor: number, m: Margin) => feeOf(STARTER[cat][kind], amountMinor) + m.flatMinor + ceilDiv(amountMinor * m.bps, 10_000);

// Coût réel du plan actuel, lu dans `fees` de GET /products.
export function liveCost(kind: Kind, fees: any, amountMinor: number): number {
  const n = (x: unknown) => { const v = Number(x); if (!Number.isFinite(v) || v < 0) throw new Error('fees_unreadable'); return v; };
  const r: FeeRule = kind === 'issue'
    ? { fixed: n(fees?.issue_fixed_minor ?? 0), bps: n(fees?.issue_bps ?? 0), min: n(fees?.issue_min_minor ?? 0) }
    : { fixed: n(fees?.recharge_fixed_minor ?? 0), bps: n(fees?.recharge_bps ?? 0), min: n(fees?.recharge_min_minor ?? 0) };
  return feeOf(r, amountMinor);
}
// Montants du registre : 1 USD = 1 000 000 unités ; 1 centime = 10 000 unités.
export const centsToUnits = (c: number) => c * 10_000;
export const centsToUsd = (c: number) => (c / 100).toFixed(2);
