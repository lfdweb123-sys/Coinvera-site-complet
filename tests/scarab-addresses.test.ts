import { describe, expect, it } from 'vitest';
import { mapDepositAddresses, SCARAB_PAY } from '@/lib/scarab/pay';
import { byId } from '@/lib/cryptos';
describe('adresses de dépôt du prestataire', () => {
  it('4 réseaux x 2 cryptos (une ligne par couple) : tout est exposé', () => {
    const rows = ['trc20', 'bep20', 'erc20', 'polygon'].flatMap(n => ['USDT', 'USDC'].map(a => ({ network: n, asset: a, address: `addr-${a}-${n}` })));
    const m = mapDepositAddresses(rows); expect(Object.keys(m).sort()).toEqual(SCARAB_PAY.filter(i => !i.endsWith('sol')).sort()); expect(m.usdcpolygon).toBe('addr-USDC-polygon'); expect(m.usdttrc20).toBe('addr-USDT-trc20');
  });
  it('une ligne par réseau avec la liste des cryptos', () => { const m = mapDepositAddresses([{ network: 'BEP20', assets: ['USDT', 'USDC'], address: 'x' }]); expect(Object.keys(m).sort()).toEqual(['usdcbsc', 'usdtbsc']); });
  it('adresse avec mémo ou crypto inconnue : écartée', () => { expect(mapDepositAddresses([{ network: 'trc20', asset: 'USDT', address: 'a', memo: '1' }, { network: 'trc20', asset: 'DOGE', address: 'b' }, { network: 'stellar', asset: 'USDT', address: 'c' }])).toEqual({}); });
  it('chaque couple a un réseau surveillé', () => { for (const id of SCARAB_PAY) { const c = byId(id)!; expect(c.scan && c.token).toBeTruthy(); } });
});
import { stableFromAssetId } from '@/lib/cryptos';
describe('identifiants crypto du prestataire (cartes standard)', () => {
  it('toutes les écritures usuelles sont reconnues', () => {
    expect(stableFromAssetId('usdt_trc20')).toBe('usdttrc20'); expect(stableFromAssetId('usdt_bep20')).toBe('usdtbsc'); expect(stableFromAssetId('usdt_erc20')).toBe('usdterc20'); expect(stableFromAssetId('usdt_polygon')).toBe('usdtpolygon');
    expect(stableFromAssetId('usdc_trc20')).toBe('usdctrc20'); expect(stableFromAssetId('usdc_bsc')).toBe('usdcbsc'); expect(stableFromAssetId('USDC-ERC20')).toBe('usdc'); expect(stableFromAssetId('usdc_matic')).toBe('usdcpolygon');
  });
  it('inconnu : ignoré', () => { expect(stableFromAssetId('btc')).toBeUndefined(); expect(stableFromAssetId('usdt_stellar')).toBeUndefined(); expect(stableFromAssetId('dai_erc20')).toBeUndefined(); });
});
describe('écritures de réseau tolérées (carte pro)', () => {
  it('bsc / matic / tron / ethereum et identifiants composés', () => {
    const m = mapDepositAddresses([{ network: 'BSC', asset: 'USDT', address: 'a' }, { network: 'matic', asset: 'USDC', address: 'b' }, { network: 'Tron', asset: 'USDT', address: 'c' }, { network: 'ethereum', asset: 'usdc', address: 'd' }, { asset: 'usdt_polygon', address: 'e' }]);
    expect(m).toMatchObject({ usdtbsc: 'a', usdcpolygon: 'b', usdttrc20: 'c', usdc: 'd', usdtpolygon: 'e' });
  });
});

it('Solana reconnu', () => { expect(mapDepositAddresses([{ network: 'solana', asset: 'USDT', address: 'x' }])).toEqual({ usdtsol: 'x' }); });
it('réponse réelle : actifs groupés dans une chaîne « USDC,USDT »', () => {
  const m = mapDepositAddresses([{ network: 'bep20', asset: 'USDC,USDT', address: '0xB' }, { network: 'erc20', asset: 'USDC,USDT', address: '0xE' }, { network: 'polygon', asset: 'USDC,USDT', address: '0xP' }, { network: 'trc20', asset: 'USDT', address: 'TL' }]);
  expect(Object.keys(m).sort()).toEqual(['usdc', 'usdcbsc', 'usdcpolygon', 'usdtbsc', 'usdterc20', 'usdtpolygon', 'usdttrc20']);
  expect(m.usdcbsc).toBe('0xB'); expect(m.usdttrc20).toBe('TL'); expect(m.usdctrc20).toBeUndefined();
});
