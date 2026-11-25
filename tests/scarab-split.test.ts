import { describe, expect, it } from 'vitest';
import { splitRefund } from '@/lib/scarab/cards';
describe('anti-contournement : retour d’argent d’une carte', () => {
  it('carte financée à 100 % par le crédit : tout retourne en crédit, rien en solde retirable', () => { expect(splitRefund({ fundedTotal: 100, fundedFromCredit: 100 }, 40)).toEqual({ credit: 40, avail: 0 }); });
  it('carte mixte : prorata, et jamais plus que ce que le crédit a financé', () => {
    expect(splitRefund({ fundedTotal: 100, fundedFromCredit: 25 }, 40)).toEqual({ credit: 10, avail: 30 });
    expect(splitRefund({ fundedTotal: 100, fundedFromCredit: 100, returnedToCredit: 90 }, 40)).toEqual({ credit: 10, avail: 30 });
  });
  it('ancienne carte sans historique, ou financée par solde : tout au solde', () => { expect(splitRefund(undefined, 40)).toEqual({ credit: 0, avail: 40 }); expect(splitRefund({ fundedTotal: 100, fundedFromCredit: 0 }, 40)).toEqual({ credit: 0, avail: 40 }); });
});
