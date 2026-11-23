import dns from 'node:dns/promises';
import net from 'node:net';
// Anti-SSRF : le nom d'hôte est résolu (A et AAAA) et TOUTE adresse privée, loopback, link-local, CGNAT ou multicast est refusée ; port 443 uniquement ; pas d'identifiants dans l'URL.
const v4Bad = (ip: string) => { const [a, b] = ip.split('.').map(Number); return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || (b === 0 && ip.startsWith('192.0.0.')))) || (a === 198 && (b === 18 || b === 19)) || a >= 224; };
export const badIp = (ip: string): boolean => {
  if (net.isIPv4(ip)) return v4Bad(ip);
  if (net.isIPv6(ip)) { const x = ip.toLowerCase(); if (x === '::' || x === '::1') return true; const m = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); if (m) return v4Bad(m[1]); return /^(fc|fd|fe[89ab]|ff)/.test(x); }
  return true;
};
export async function assertPublicHost(url: string) {
  const u = new URL(url); const host = u.hostname.replace(/\.$/, '').toLowerCase();
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443') || !host || host.includes('..')) throw new Error('unsafe_host');
  if (/^(localhost|.*\.(local|internal|localhost|lan|home|corp))$/.test(host) || net.isIP(host)) throw new Error('unsafe_host');
  let addrs: { address: string }[] = [];
  try { addrs = await dns.lookup(host, { all: true }); } catch { throw new Error('unsafe_host'); }
  if (!addrs.length || addrs.some(a => badIp(a.address))) throw new Error('unsafe_host');
}
