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

describe('adresses de retrait multi-crypto', () => {
  it('BTC', () => {
    expect(validAddress('BTC', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBe(true);
    expect(validAddress('BTC', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb')).toBe(false);
    expect(validAddress('BTC', '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toBe(true);
    expect(validAddress('BTC', 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq')).toBe(true);
    expect(validAddress('BTC', 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdp')).toBe(false);
  });
  it('LTC', () => {
    expect(validAddress('LTC', 'LKDyUEtTR1HXamkiEphisSiBJu6o3ZPE34')).toBe(true);
    expect(validAddress('LTC', 'LKDyUEtTR1HXamkiEphisSiBJu6o3ZPE35')).toBe(false);
    expect(validAddress('LTC', 'M7uBSTV2qNDHDe2tHfNMqhFkZucgRMpJQk')).toBe(true);
  });
  it('SOL, XMR, EVM et TRON selon l’option', () => {
    expect(validAddress('SOL', 'So11111111111111111111111111111111111111112')).toBe(true);
    expect(validAddress('USDC_SOL', 'abc')).toBe(false);
    expect(validAddress('XMR', '4A' + '1'.repeat(93))).toBe(true);
    expect(validAddress('XMR', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBe(false);
    expect(validAddress('ETH_COIN', '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed')).toBe(true);
    expect(validAddress('USDC_TRX', 'TUw2p3iwpin3hZAATazfvbd2LT1p1AFHzM')).toBe(true);
    expect(validAddress('INCONNU', 'TUw2p3iwpin3hZAATazfvbd2LT1p1AFHzM')).toBe(false);
  });
});
