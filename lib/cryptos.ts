// Catalogue des cryptomonnaies acceptees pour l'activation. Les adresses de reception viennent des variables d'environnement PAY_ADDR_*.
export type Cur = { id: string; sym: string; net: string; name: string; chain: 'tron' | 'evm' | 'btc' | 'ltc' | 'sol'; evm?: 'eth' | 'bsc'; decimals: number; token?: string; env: string; cg?: string; stable?: boolean; scan: boolean };
export const CURS: Cur[] = [
  { id: 'usdttrc20', sym: 'USDT', net: 'TRC20', name: 'USDT (TRC-20)', chain: 'tron', decimals: 6, token: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', env: 'PAY_ADDR_USDT_TRC20', stable: true, scan: true },
  { id: 'usdtsol', sym: 'USDT', net: 'SOL', name: 'USDT (Solana)', chain: 'sol', decimals: 6, token: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNyGDV4n4DW2YkcDL', env: 'PAY_ADDR_USDT_SOL', stable: true, scan: true },
  { id: 'usdtbsc', sym: 'USDT', net: 'BEP20', name: 'USDT (BEP-20)', chain: 'evm', evm: 'bsc', decimals: 18, token: '0x55d398326f99059fF775485246999027B3197955', env: 'PAY_ADDR_USDT_BEP20', stable: true, scan: true },
  { id: 'usdterc20', sym: 'USDT', net: 'ERC20', name: 'USDT (ERC-20)', chain: 'evm', evm: 'eth', decimals: 6, token: '0xdAC17F958D2ee523a2206206994597C13D831ec7', env: 'PAY_ADDR_USDT_ERC20', stable: true, scan: true },
  { id: 'usdc', sym: 'USDC', net: 'ERC20', name: 'USD Coin (USDC)', chain: 'evm', evm: 'eth', decimals: 6, token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', env: 'PAY_ADDR_USDC_ERC20', stable: true, scan: true },
  { id: 'trx', sym: 'TRX', net: 'TRON', name: 'TRON (TRX)', chain: 'tron', decimals: 6, env: 'PAY_ADDR_TRX', cg: 'tron', scan: true },
  { id: 'btc', sym: 'Bitcoin', net: 'BTC', name: 'Bitcoin (BTC)', chain: 'btc', decimals: 8, env: 'PAY_ADDR_BTC', cg: 'bitcoin', scan: true },
  { id: 'eth', sym: 'Ethereum', net: 'ETH', name: 'Ethereum (ETH)', chain: 'evm', evm: 'eth', decimals: 18, env: 'PAY_ADDR_ETH', cg: 'ethereum', scan: false },
  { id: 'sol', sym: 'Solana', net: 'SOL', name: 'Solana (SOL)', chain: 'sol', decimals: 9, env: 'PAY_ADDR_SOL', cg: 'solana', scan: true },
  { id: 'bnbbsc', sym: 'BNB', net: 'BSC', name: 'BNB (BSC)', chain: 'evm', evm: 'bsc', decimals: 18, env: 'PAY_ADDR_BNB', cg: 'binancecoin', scan: false },
  { id: 'ltc', sym: 'Litecoin', net: 'LTC', name: 'Litecoin (LTC)', chain: 'ltc', decimals: 8, env: 'PAY_ADDR_LTC', cg: 'litecoin', scan: true },
];
export const addrOf = (c: Cur) => (process.env[c.env] ?? '').trim();
export const available = () => CURS.filter(c => addrOf(c));
export const byId = (id: string) => CURS.find(c => c.id === id);
// Nom usuel du réseau, pour l'avertissement affiché à côté de chaque adresse de dépôt (le même jeton existe sur plusieurs
// réseaux non interchangeables : envoyer sur le mauvais réseau fait perdre les fonds, sans recours possible).
const NET_NAME: Record<string, string> = { TRC20: 'Tron', TRON: 'Tron', BEP20: 'BNB Smart Chain', BSC: 'BNB Smart Chain', ERC20: 'Ethereum', ETH: 'Ethereum', SOL: 'Solana', BTC: 'Bitcoin', LTC: 'Litecoin' };
export const networkWarning = (c: Pick<Cur, 'sym' | 'net'>) => `Envoyez uniquement ${c.sym} sur cette adresse, via le réseau ${NET_NAME[c.net] ?? c.net} (${c.net}). Tout envoi via un autre réseau peut entraîner la perte de vos fonds.`;
export function fmt(u: bigint, dec: number) { const s = u.toString().padStart(dec + 1, '0'); const i = s.slice(0, -dec) || '0', f = s.slice(-dec).replace(/0+$/, ''); return f ? `${i}.${f}` : i; }
