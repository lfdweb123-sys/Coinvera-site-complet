// Vérification « humain » (Cloudflare Turnstile) demandée UNE fois : une fois le défi réussi, un cookie signé (HMAC) vous laisse naviguer sur tout le site.
// Fonctions pures et Web Crypto uniquement : utilisables dans proxy.ts, dans la route de validation et dans les tests.
export const HUMAN_COOKIE = 'cv_human';
export const HUMAN_TTL = 7 * 24 * 3600;   // validité du cookie : 7 jours
const secret = () => process.env.HUMAN_SECRET ?? process.env.CAPTCHA_SECRET ?? process.env.API_SECRET_ENC_KEY ?? '';
// Le contrôle n'est actif que si Turnstile ET le secret de signature sont configurés : sinon le site reste ouvert (jamais verrouillé par erreur). HUMAN_GATE=off le coupe.
export const gateEnabled = () => process.env.HUMAN_GATE !== 'off' && !!process.env.TURNSTILE_SECRET_KEY && !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !!secret();
const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function hmac(msg: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)));
}
export async function signHuman(now = Date.now()) { const exp = Math.floor(now / 1000) + HUMAN_TTL; return `${exp}.${await hmac('human.' + exp)}`; }
export async function checkHuman(v: string | undefined | null, now = Date.now()) {
  if (!v || !secret()) return false; const [e, s] = v.split('.'); const exp = Number(e);
  if (!s || !Number.isInteger(exp) || exp * 1000 < now) return false;
  const good = await hmac('human.' + exp); if (good.length !== s.length) return false;
  let d = 0; for (let i = 0; i < good.length; i++) d |= good.charCodeAt(i) ^ s.charCodeAt(i); return d === 0;   // comparaison à durée constante
}
// Redirection « next » : uniquement un chemin interne du site (jamais une URL externe, jamais une boucle vers la vérification ou l'API).
export const safeNext = (n?: string | null) => (!n || !n.startsWith('/') || n.startsWith('//') || n.startsWith('/\\') || /[\r\n]/.test(n) || /^\/(verification|api)(\/|\?|$)/.test(n)) ? '/' : n;
// Moteurs de recherche et aperçus de partage : ils ne passent pas le défi, sinon le site disparaîtrait de Google. (L'identifiant du navigateur peut être imité : c'est le compromis habituel.)
export const BOT_UA = /googlebot|google-inspectiontool|storebot-google|adsbot-google|mediapartners-google|bingbot|bingpreview|duckduckbot|slurp|baiduspider|yandexbot|applebot|facebookexternalhit|facebot|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot|slackbot|pinterestbot/i;
export function needsGate(r: { method: string; path: string; host: string; ua?: string | null; dest?: string | null; accept?: string | null; rsc?: boolean }) {
  if (r.method !== 'GET' && r.method !== 'HEAD') return false;
  if (r.rsc) return false;                                                                        // navigation interne déjà autorisée par le premier chargement
  if (/^(api|docs|status|helpcenter)\./.test(r.host.toLowerCase())) return false;                  // sous-domaines techniques
  if (/^\/(api|verification|_next|opengraph-image)(\/|$)/.test(r.path)) return false;
  if (r.ua && BOT_UA.test(r.ua)) return false;
  return r.dest ? r.dest === 'document' : (r.accept ?? '').includes('text/html');                // uniquement les pages vues par un navigateur
}
