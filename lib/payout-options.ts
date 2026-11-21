// Cryptomonnaies disponibles pour les retraits. Fichier sans dépendance : utilisable côté client (formulaire) et côté serveur (validation stricte dans address.ts).
// id = identifiant interne (conserve TRX / ETH / BSC pour USDT) ; coin + chain = codes envoyés à l'exchange ; cg = identifiant de cours (coins volatils : le montant en USD est converti à l'envoi).
export type PayoutKind = 'tron' | 'evm' | 'btc' | 'ltc' | 'sol' | 'xmr';
export type PayoutOpt = { id: string; coin: string; chain: string; sym: string; name: string; std: string; kind: PayoutKind; hint: string; re: RegExp; fee: number; cg?: string };
const TRX_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/, EVM_RE = /^0x[0-9a-fA-F]{40}$/, SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const BTC_RE = /^(bc1[02-9ac-hj-np-z]{11,71}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/, LTC_RE = /^(ltc1[02-9ac-hj-np-z]{11,71}|[LM3][1-9A-HJ-NP-Za-km-z]{25,34})$/, XMR_RE = /^[48][0-9AB][1-9A-HJ-NP-Za-km-z]{93}$/;
const H = { tron: 'TRC-20 : l’adresse commence par T (34 caractères).', evm: (s: string) => `${s} : l’adresse commence par 0x (42 caractères).`, sol: 'Solana : adresse de 32 à 44 caractères (base58).' };
export const PAYOUT_OPTS: PayoutOpt[] = [
  { id: 'BTC', coin: 'BTC', chain: 'BTC', sym: 'Bitcoin', name: 'Bitcoin', std: 'BTC', kind: 'btc', hint: 'Bitcoin : l’adresse commence par 1, 3 ou bc1.', re: BTC_RE, fee: 5, cg: 'bitcoin' },
  { id: 'TRX', coin: 'USDT', chain: 'TRX', sym: 'USDT', name: 'USDT', std: 'TRC-20', kind: 'tron', hint: H.tron, re: TRX_RE, fee: 1 },
  { id: 'ETH_COIN', coin: 'ETH', chain: 'ETH', sym: 'Ethereum', name: 'Ethereum', std: 'ETH', kind: 'evm', hint: 'Ethereum : l’adresse commence par 0x (42 caractères).', re: EVM_RE, fee: 3, cg: 'ethereum' },
  { id: 'LTC', coin: 'LTC', chain: 'LTC', sym: 'Litecoin', name: 'Litecoin', std: 'LTC', kind: 'ltc', hint: 'Litecoin : l’adresse commence par L, M ou ltc1.', re: LTC_RE, fee: 1, cg: 'litecoin' },
  { id: 'XMR', coin: 'XMR', chain: 'XMR', sym: 'Monero', name: 'Monero', std: 'XMR', kind: 'xmr', hint: 'Monero : adresse standard de 95 caractères commençant par 4 ou 8.', re: XMR_RE, fee: 1, cg: 'monero' },
  { id: 'SOL', coin: 'SOL', chain: 'SOL', sym: 'Solana', name: 'Solana', std: 'SOL', kind: 'sol', hint: H.sol, re: SOL_RE, fee: 1, cg: 'solana' },
  { id: 'USDC_TRX', coin: 'USDC', chain: 'TRX', sym: 'USDC', name: 'USDC', std: 'TRC-20', kind: 'tron', hint: H.tron, re: TRX_RE, fee: 1 },
  { id: 'ETH', coin: 'USDT', chain: 'ETH', sym: 'USDT', name: 'USDT', std: 'ERC-20', kind: 'evm', hint: H.evm('ERC-20'), re: EVM_RE, fee: 5 },
  { id: 'BSC', coin: 'USDT', chain: 'BSC', sym: 'USDT', name: 'USDT', std: 'BEP-20', kind: 'evm', hint: H.evm('BEP-20'), re: EVM_RE, fee: 1 },
  { id: 'USDT_SOL', coin: 'USDT', chain: 'SOL', sym: 'USDT', name: 'USDT', std: 'Solana', kind: 'sol', hint: H.sol, re: SOL_RE, fee: 1 },
  { id: 'USDC_ETH', coin: 'USDC', chain: 'ETH', sym: 'USDC', name: 'USDC', std: 'ERC-20', kind: 'evm', hint: H.evm('ERC-20'), re: EVM_RE, fee: 5 },
  { id: 'USDC_BSC', coin: 'USDC', chain: 'BSC', sym: 'USDC', name: 'USDC', std: 'BEP-20', kind: 'evm', hint: H.evm('BEP-20'), re: EVM_RE, fee: 1 },
  { id: 'USDC_SOL', coin: 'USDC', chain: 'SOL', sym: 'USDC', name: 'USDC', std: 'Solana', kind: 'sol', hint: H.sol, re: SOL_RE, fee: 1 },
];
export const OPT: Record<string, PayoutOpt> = Object.fromEntries(PAYOUT_OPTS.map(o => [o.id, o]));
// Frais de retrait (USD) : réglage admin « withdrawalFee<ID> » s'il existe, sinon valeur par défaut de l'option.
export const feeOf = (s: Record<string, any>, o: PayoutOpt): number => Number(s['withdrawalFee' + o.id] ?? o.fee);
