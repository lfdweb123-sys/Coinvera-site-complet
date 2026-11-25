import { describe, expect, it } from 'vitest';
import { mapDepositAddresses, SCARAB_PAY } from '@/lib/scarab/pay';
import { byId } from '@/lib/cryptos';
describe('adresses de dépôt du prestataire', () => {
  it('4 réseaux x 2 cryptos (une ligne par couple) : tout est exposé', () => {
    const rows = ['trc20', 'bep20', 'erc20', 'polygon'].flatMap(n => ['USDT', 'USDC'].map(a => ({ network: n, asset: a, address: `addr-${a}-${n}` })));
    const m = mapDepositAddresses(rows); expect(Object.keys(m).sort()).toEqual([...SCARAB_PAY].sort()); expect(m.usdcpolygon).toBe('addr-USDC-polygon'); expect(m.usdttrc20).toBe('addr-USDT-trc20');
  });
  it('une ligne par réseau avec la liste des cryptos', () => { const m = mapDepositAddresses([{ network: 'BEP20', assets: ['USDT', 'USDC'], address: 'x' }]); expect(Object.keys(m).sort()).toEqual(['usdcbsc', 'usdtbsc']); });
  it('adresse avec mémo ou crypto inconnue : écartée', () => { expect(mapDepositAddresses([{ network: 'trc20', asset: 'USDT', address: 'a', memo: '1' }, { network: 'trc20', asset: 'DOGE', address: 'b' }, { network: 'solana', asset: 'USDT', address: 'c' }])).toEqual({}); });
  it('chaque couple a un réseau surveillé', () => { for (const id of SCARAB_PAY) { const c = byId(id)!; expect(c.scan && c.token).toBeTruthy(); } });
});
