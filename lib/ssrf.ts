import dns from 'node:dns/promises';
import net from 'node:net';
import https from 'node:https';
// Anti-SSRF : le nom d'hôte est résolu (A et AAAA) et TOUTE adresse privée, loopback, link-local, CGNAT ou multicast est refusée ; port 443 uniquement ; pas d'identifiants dans l'URL.
const v4Bad = (ip: string) => { const [a, b] = ip.split('.').map(Number); return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || (b === 0 && ip.startsWith('192.0.0.')))) || (a === 198 && (b === 18 || b === 19)) || a >= 224; };
export const badIp = (ip: string): boolean => {
  if (net.isIPv4(ip)) return v4Bad(ip);
  if (net.isIPv6(ip)) { const x = ip.toLowerCase(); if (x === '::' || x === '::1') return true; const m = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); if (m) return v4Bad(m[1]); return /^(fc|fd|fe[89ab]|ff)/.test(x); }
  return true;
};
// Résout UNE fois le nom d'hôte, refuse toute adresse non publique et renvoie l'adresse validée.
export async function resolvePublic(url: string) {
  const u = new URL(url); const host = u.hostname.replace(/\.$/, '').toLowerCase();
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443') || !host || host.includes('..')) throw new Error('unsafe_host');
  if (/^(localhost|.*\.(local|internal|localhost|lan|home|corp))$/.test(host) || net.isIP(host)) throw new Error('unsafe_host');
  let addrs: { address: string; family: number }[] = [];
  try { addrs = await dns.lookup(host, { all: true }); } catch { throw new Error('unsafe_host'); }
  if (!addrs.length || addrs.some(a => badIp(a.address))) throw new Error('unsafe_host');
  return { u, address: addrs[0].address, family: addrs[0].family };
}
export const assertPublicHost = async (url: string) => { await resolvePublic(url); };
// Résolveur « épinglé » : la connexion part vers l'adresse DÉJÀ validée, quel que soit ce que le DNS répondrait ensuite (anti « DNS rebinding »).
export const pinnedLookup = (address: string, family: number) => (_h: string, o: any, cb: any) => (o && o.all ? cb(null, [{ address, family }]) : cb(null, address, family));
// POST HTTPS vers l'URL d'un marchand : adresse validée puis épinglée, TLS vérifié sur le vrai nom d'hôte (SNI), aucune redirection suivie, réponse non lue. Renvoie le code HTTP.
export async function postPinned(url: string, body: string, headers: Record<string, string>, timeoutMs = 8000): Promise<number> {
  const { u, address, family } = await resolvePublic(url);
  return new Promise<number>((resolve, reject) => {
    const req = https.request({ method: 'POST', hostname: u.hostname, port: 443, path: u.pathname + u.search, servername: u.hostname, agent: false, lookup: pinnedLookup(address, family) as any,
      headers: { ...headers, 'Content-Length': String(Buffer.byteLength(body)) } }, res => { const code = res.statusCode ?? 0; res.destroy(); resolve(code); });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout'))); req.on('error', reject); req.end(body);
  });
}
