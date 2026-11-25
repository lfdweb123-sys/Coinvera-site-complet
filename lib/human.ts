import crypto from 'node:crypto';
import { HttpError } from './auth';
// Vérification « êtes-vous humain » par Cloudflare Turnstile, faite UNE fois (page d'accueil, ou au moment d'une action sensible).
// Après un contrôle réussi côté serveur, un cookie signé (HMAC, HttpOnly, 12 h) prouve la vérification : les endpoints sensibles l'exigent via requireHuman().
// Le cookie ne contient aucune donnée personnelle. Désactivé tant que les DEUX clés Turnstile ne sont pas configurées : déployer sans clés ne bloque donc jamais le site.
export const HUMAN_COOKIE = 'cv_human';        // preuve signée, HttpOnly : seule source de vérité côté serveur
export const HUMAN_FLAG = 'cv_human_ok';       // simple témoin lisible par le navigateur : sert à ne pas réafficher la vérification (aucune valeur de sécurité)
export const HUMAN_TTL = 12 * 3600;            // secondes
export const humanEnabled = () => !!process.env.TURNSTILE_SECRET_KEY?.trim() && !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
const key = () => crypto.createHash('sha256').update('cv-human|' + (process.env.HUMAN_COOKIE_SECRET?.trim() || process.env.TURNSTILE_SECRET_KEY?.trim() || 'dev-only')).digest();
const mac = (body: string) => crypto.createHmac('sha256', key()).update(body).digest('hex');
export function signHuman(nowMs = Date.now()): string {
  const body = `${Math.floor(nowMs / 1000) + HUMAN_TTL}.${crypto.randomBytes(6).toString('hex')}`;
  return `${body}.${mac(body)}`;
}
export function validHuman(v: string | undefined | null, nowMs = Date.now()): boolean {
  const [exp, nonce, sig] = (v ?? '').split('.'); if (!exp || !nonce || !sig || !/^\d+$/.test(exp) || Number(exp) <= nowMs / 1000) return false;
  const want = mac(`${exp}.${nonce}`); return sig.length === want.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want));
}
export const cookieOf = (req: Request, name: string) => (req.headers.get('cookie') ?? '').split(';').map(c => c.trim()).find(c => c.startsWith(name + '='))?.slice(name.length + 1);
export const isHuman = (req: Request) => validHuman(cookieOf(req, HUMAN_COOKIE));
/** À appeler au début d'un endpoint sensible. Sans effet quand Turnstile n'est pas configuré. */
export function requireHuman(req: Request) { if (humanEnabled() && !isHuman(req)) throw new HttpError(403, 'human_required'); }
/** Contrôle du jeton auprès de Cloudflare. Toute erreur (réseau, réponse illisible) = refus : le visiteur peut simplement réessayer. */
export async function verifyTurnstile(token: string, ip: string, f: typeof fetch = fetch): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim(); if (!secret || !token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token }); if (ip && ip !== 'x') body.set('remoteip', ip);
    const r = await f('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body, signal: AbortSignal.timeout(6000) });
    return r.ok && (await r.json() as { success?: boolean }).success === true;
  } catch { return false; }
}
export const humanCookies = (secure: boolean) => {
  const base = `Path=/; Max-Age=${HUMAN_TTL}; SameSite=Lax${secure ? '; Secure' : ''}`;
  return [`${HUMAN_COOKIE}=${signHuman()}; ${base}; HttpOnly`, `${HUMAN_FLAG}=1; ${base}`];
};
