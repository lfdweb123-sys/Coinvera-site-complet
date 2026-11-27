// Porte d'accès à l'interface d'administration : sans cookie signé (HMAC), /admin répond 404 comme une page inexistante, donc invisible pour un scanner ou un curieux.
// Le cookie n'est délivré qu'à un compte administrateur authentifié (voir /api/admin/gate). La vraie protection reste côté API (rôle admin + double authentification).
// Web Crypto uniquement : utilisable dans proxy.ts. Sans secret de signature, la porte reste ouverte (jamais de verrouillage par erreur) ; ADMIN_GATE=off la coupe.
export const ADMIN_COOKIE = 'cv_adm';
export const ADMIN_TTL = 12 * 3600;
const secret = () => process.env.ADMIN_GATE_SECRET ?? process.env.API_SECRET_ENC_KEY ?? '';
export const adminGateEnabled = () => process.env.ADMIN_GATE !== 'off' && !!secret();
const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function hmac(msg: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)));
}
export async function signAdmin(uid: string, now = Date.now()) { const exp = Math.floor(now / 1000) + ADMIN_TTL; return `${exp}.${await hmac(`admin.${uid}.${exp}`)}.${uid}`; }
export async function checkAdmin(v: string | undefined | null, now = Date.now()) {
  if (!v || !secret()) return false; const [e, s, ...u] = v.split('.'); const uid = u.join('.'), exp = Number(e);
  if (!s || !uid || !Number.isInteger(exp) || exp * 1000 < now) return false;
  const good = await hmac(`admin.${uid}.${exp}`); if (good.length !== s.length) return false;
  let d = 0; for (let i = 0; i < good.length; i++) d |= good.charCodeAt(i) ^ s.charCodeAt(i); return d === 0;   // comparaison à durée constante
}
export const isAdminPath = (p: string) => p === '/admin' || p.startsWith('/admin/');
