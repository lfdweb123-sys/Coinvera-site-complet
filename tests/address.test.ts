import { describe, expect, it } from 'vitest';
import { validAddress } from '@/lib/address';
describe('validation des adresses de retrait', () => {
  it('TRON : accepte une adresse valide, refuse une faute de frappe', () => {
    expect(validAddress('TRX', 'TUw2p3iwpin3hZAATazfvbd2LT1p1AFHzM')).toBe(true);
    expect(validAddress('TRX', 'TUw2p3iwpin3hZAATazfvbd2LT1p1AFHzN')).toBe(false);
    expect(validAddress('TRX', '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed')).toBe(false);
  });
  it('EVM : somme de controle EIP-55', () => {
    expect(validAddress('ETH', '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed')).toBe(true);
    expect(validAddress('BSC', '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAEd')).toBe(false);
    expect(validAddress('ETH', '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed')).toBe(true);
    expect(validAddress('ETH', 'TUw2p3iwpin3hZAATazfvbd2LT1p1AFHzM')).toBe(false);
    expect(validAddress('ETH', '0x' + '0'.repeat(40))).toBe(false);
  });
});
