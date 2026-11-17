import { sha256 } from '@noble/hashes/sha2.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58(s: string) {
  let n = 0n; for (const c of s) { const i = B58.indexOf(c); if (i < 0) return null; n = n * 58n + BigInt(i); }
  let h = n.toString(16); if (h.length % 2) h = '0' + h; let z = 0; for (const c of s) { if (c === '1') z++; else break; }
  return Buffer.concat([Buffer.alloc(z), Buffer.from(h, 'hex')]);
}
// TRON : base58check (prefixe 0x41, 25 octets, somme de controle double SHA-256)
export function validTron(a: string) {
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a)) return false; const d = b58(a);
  if (!d || d.length !== 25 || d[0] !== 0x41) return false;
  return Buffer.from(sha256(sha256(d.subarray(0, 21))).subarray(0, 4)).equals(d.subarray(21));
}
// EVM : 0x + 40 hex ; si l'adresse est en casse mixte, la somme de controle EIP-55 doit etre exacte.
export function validEvm(a: string) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(a) || /^0x0{40}$/.test(a)) return false;
  const b = a.slice(2); if (b === b.toLowerCase() || b === b.toUpperCase()) return true;
  const h = Buffer.from(keccak_256(Buffer.from(b.toLowerCase()))).toString('hex');
  return [...b].every((c, i) => /\d/.test(c) || (parseInt(h[i], 16) >= 8 ? c === c.toUpperCase() : c === c.toLowerCase()));
}
export const NETWORKS: Record<string, { label: string; std: string; hint: string }> = {
  TRX: { label: 'TRON', std: 'TRC20', hint: 'L’adresse commence par T' }, ETH: { label: 'Ethereum', std: 'ERC20', hint: 'L’adresse commence par 0x' }, BSC: { label: 'BNB Smart Chain', std: 'BEP20', hint: 'L’adresse commence par 0x' } };
export const validAddress = (chain: string, a: string) => chain === 'TRX' ? validTron(a) : chain === 'ETH' || chain === 'BSC' ? validEvm(a) : false;
