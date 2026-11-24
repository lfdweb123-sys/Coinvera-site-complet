import { describe, expect, it } from 'vitest';
import { whatsappRateUsd } from '@/lib/whatsapp-billing';
const s = { whatsappRateCartUsd: 0.07, whatsappRateStatusUsd: 0.02 };
describe('tarif WhatsApp par catégorie', () => {
  it('facture la relance panier au tarif marketing', () => { expect(whatsappRateUsd('cart', s)).toBe(0.07); });
  it('facture statut, confirmation COD et échéance au tarif utilitaire', () => { for (const k of ['status', 'cod', 'installment'] as const) expect(whatsappRateUsd(k, s)).toBe(0.02); });
});
