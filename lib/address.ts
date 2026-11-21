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
import { OPT } from './payout-options';
function b58check(a: string, versions: number[]) { const d = b58(a); if (!d || d.length !== 25 || !versions.includes(d[0])) return false; return Buffer.from(sha256(sha256(d.subarray(0, 21))).subarray(0, 4)).equals(d.subarray(21)); }
// Bech32 / Bech32m (BIP-173 / BIP-350) : somme de controle complete
const CH = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function polymod(v: number[]) { let c = 1; const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]; for (const x of v) { const b = c >>> 25; c = ((c & 0x1ffffff) << 5) ^ x; for (let i = 0; i < 5; i++) if ((b >>> i) & 1) c ^= G[i]; } return c >>> 0; }
function bech32(a: string, hrp: string) {
  const l = a.toLowerCase(); if (a !== l && a !== a.toUpperCase()) return false; const p = l.lastIndexOf('1'); if (p < 1 || l.slice(0, p) !== hrp || l.length < 14 || l.length > 90) return false;
  const data: number[] = []; for (const c of l.slice(p + 1)) { const i = CH.indexOf(c); if (i < 0) return false; data.push(i); }
  const pm = polymod([...[...hrp].map(c => c.charCodeAt(0) >> 5), 0, ...[...hrp].map(c => c.charCodeAt(0) & 31), ...data]);
  return data[0] === 0 ? pm === 1 : data[0] <= 16 && pm === 0x2bc830a3;
}
export const validBtc = (a: string) => b58check(a, [0x00, 0x05]) || bech32(a, 'bc');
export const validLtc = (a: string) => b58check(a, [0x30, 0x32, 0x05]) || bech32(a, 'ltc');
export const validSol = (a: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a) && b58(a)?.length === 32;
export const validXmr = (a: string) => /^[48][0-9AB][1-9A-HJ-NP-Za-km-z]{93}$/.test(a);
// id = identifiant d'option de retrait (voir payout-options.ts)
export function validAddress(id: string, a: string) {
  const o = OPT[id]; if (!o) return false;
  switch (o.kind) { case 'tron': return validTron(a); case 'evm': return validEvm(a); case 'btc': return validBtc(a); case 'ltc': return validLtc(a); case 'sol': return validSol(a); case 'xmr': return validXmr(a); }
}
