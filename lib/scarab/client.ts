// Client de l'API marchand ScarabPay (Virtuals cards pro). Serveur uniquement : l'identifiant et le secret de la clé ne doivent jamais atteindre le navigateur.
// Chaque requête est signée : HMAC-SHA256 (base64) d'une chaîne canonique de 7 lignes, avec un horodatage et un nonce à usage unique.
import crypto from 'node:crypto';
import { HttpError } from '../auth';
import { warn } from '../log';

export const SP_BASE = () => (process.env.SCARABPAY_BASE_URL ?? 'https://business.scarabpay.com/api/v1').replace(/\/+$/, '');

// Réponse d'erreur du prestataire. `code` = « clé:valeur » de l'objet `errors` (ex. balance:insufficient_funds, gateway:invalid_signature),
// ou validation_error avec le détail par champ dans `fields`. Jamais le message texte, qui peut être reformulé.
export class SpError extends HttpError { constructor(status: number, code: string, public fields: Record<string, string[]> = {}, public retryAfter = 0) { super(status, code); } }
// Aucune réponse exploitable (timeout, 500, 502, 504) : l'état de l'opération est INCONNU — ne jamais rembourser sur cette base, rejouer la même clé d'idempotence.
export class SpUnknown extends HttpError { constructor() { super(502, 'scarab_unreachable'); } }

// 'definitive' : refus net, rien n'a bougé chez eux, on peut libérer les fonds.
// 'retry'      : rien n'a bougé non plus (429, 503, nonce/horloge) : on réessaie plus tard avec la MÊME clé d'idempotence.
// 'unknown'    : peut-être exécuté : on garde la réservation et on rejoue la même clé.
export type Outcome = 'definitive' | 'retry' | 'unknown';
export function outcomeOf(e: unknown): Outcome {
  if (e instanceof HttpError && e.code === 'scarab_not_configured') return 'definitive';   // jamais parti chez eux : on rend les fonds
  if (e instanceof SpUnknown || !(e instanceof SpError)) return 'unknown';
  if (e.code === 'idempotency:in_flight') return 'unknown';
  if (e.status === 429 || e.status === 503) return 'retry';
  if (e.code === 'gateway:replay_detected' || e.code === 'gateway:timestamp_out_of_window') return 'retry';
  return 'definitive';
}

// Code d'erreur sûr pour l'utilisateur : jamais le nom du prestataire ni un détail interne (voir lib/scarab/errors.ts pour les textes).
export function publicCode(e: unknown): string {
  if (!(e instanceof SpError)) return e instanceof HttpError ? e.code : 'scarab_unavailable';
  const c = e.code;
  if (c === 'validation_error') return 'validation_error';
  if (c.startsWith('amount:') || c.startsWith('amount_minor:')) return 'invalid_amount';
  if (c === 'customer:kyc_not_approved' || c === 'customer:kyc_incomplete') return 'kyc_not_approved';
  if (c === 'customer:card_limit_reached') return 'scarab_customer_limit';
  if (c === 'card:invalid_state') return 'card_state';
  if (c === 'card:termination_blocked') return 'scarab_termination_blocked';
  if (c === 'card:issue_failed') return 'provider_rejected';
  if (c === 'card:provider_busy') return 'scarab_busy';
  if (c === 'card:provider_error') return 'provider_rejected';
  if (c.startsWith('card:details')) return 'scarab_details_unavailable';
  if (c === 'name_on_card:required') return 'name_required';
  if (e.status === 404) return 'card_not_found';
  return 'scarab_unavailable';   // 401/402/403, solde du programme, plan, produit indisponible : c'est à nous de corriger, pas à l'utilisateur
}

// ---- Signature -------------------------------------------------------------------------------------------------------------
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()).replace(/%20/g, '+');
export type Query = Record<string, string | number | undefined>;
// Chaîne de requête canonique : triée par clé, chaque côté encodé (espace = +), valeurs absentes ignorées. C'est AUSSI celle qu'on envoie dans l'URL.
export function canonicalQuery(q: Query = {}) {
  return Object.keys(q).sort().filter(k => q[k] !== undefined && q[k] !== '').map(k => `${enc(k)}=${enc(String(q[k]))}`).join('&');
}
export const sha256hex = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
// 7 lignes séparées par un seul \n, sans \n final : METHOD, PATH complet (préfixe /api/v1 inclus), QUERY, clé, horodatage, nonce, sha256(corps).
export const canonicalString = (a: { method: string; path: string; query: string; keyId: string; ts: string; nonce: string; body: string }) =>
  [a.method.toUpperCase(), a.path, a.query, a.keyId, a.ts, a.nonce, sha256hex(a.body)].join('\n');
// Le secret (44 caractères base64) sert de clé HMAC TEL QUEL, sans être décodé.
export const signCanonical = (secret: string, canonical: string) => crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('base64');

// ---- Appel -----------------------------------------------------------------------------------------------------------------
export type SpResult = { status: number; data: any; meta?: any; message?: string };
export async function sp(method: 'GET' | 'POST' | 'PATCH', path: string, o: { query?: Query; body?: unknown; bodyRaw?: string; idem?: string } = {}): Promise<SpResult> {
  const clean = (v?: string) => v?.trim().replace(/^["']|["']$/g, '').trim();   // un secret collé avec espace, retour à la ligne ou guillemets casserait la signature
  const keyId = clean(process.env.SCARABPAY_KEY_ID), secret = clean(process.env.SCARABPAY_SECRET);
  if (!keyId || !secret) throw new HttpError(503, 'scarab_not_configured');
  const base = SP_BASE(), url = new URL(base + path);
  const query = canonicalQuery(o.query);
  // Un corps sérialisé UNE fois : l'octet près ce qui est signé est ce qui est envoyé (et ce que la clé d'idempotence compare).
  const body = o.bodyRaw ?? (o.body === undefined ? '' : JSON.stringify(o.body));
  const ts = String(Math.floor(Date.now() / 1000)), nonce = crypto.randomUUID();   // horodatage et nonce frais à CHAQUE tentative
  const signature = signCanonical(secret, canonicalString({ method, path: url.pathname.replace(/\/+$/, ''), query, keyId, ts, nonce, body }));
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Api-Key': keyId, 'X-Timestamp': ts, 'X-Nonce': nonce, 'X-Signature': signature };
  if (o.idem) headers['Idempotency-Key'] = o.idem;
  let r: Response;
  try { r = await fetch(url.origin + url.pathname + (query ? '?' + query : ''), { method, headers, body: body === '' ? undefined : body, signal: AbortSignal.timeout(25_000), cache: 'no-store', redirect: 'manual' }); }
  catch (e) { warn('scarab.unreachable', { method, path, message: (e as Error).message }); throw new SpUnknown(); }
  const text = await r.text(); let j: any = {}; try { j = text ? JSON.parse(text) : {}; } catch { j = {}; }
  if (r.ok && j.success !== false) return { status: r.status, data: j.data, meta: j.meta, message: j.message };
  if (r.status >= 500 && r.status !== 503) { warn('scarab.error_unknown_outcome', { method, path, status: r.status }); throw new SpUnknown(); }
  if (r.status >= 300 && r.status < 400) warn('scarab.redirect', { method, path, status: r.status, location: r.headers.get('location') });
  const errs = (j.errors && typeof j.errors === 'object' ? j.errors : {}) as Record<string, string[]>;
  const k = Object.keys(errs)[0], v = k ? String((errs[k] ?? [])[0] ?? '') : '';
  const isCode = !!k && /^[a-z0-9_]+$/.test(v);   // un code stable (insufficient_funds) et non une phrase de validation (« The amount field… »)
  const code = isCode ? `${k}:${v}` : k ? 'validation_error' : `http_${r.status}`;
  warn('scarab.error', { method, path, status: r.status, code });
  throw new SpError(r.status, code, isCode ? {} : errs, Number(r.headers.get('retry-after') ?? 0) || 0);
}

// Pour les routes qui appellent directement l'API : l'erreur sort avec un code public (jamais le détail du prestataire).
export async function spx(method: 'GET' | 'POST' | 'PATCH', path: string, o: Parameters<typeof sp>[2] = {}) {
  try { return await sp(method, path, o); }
  catch (e) { if (e instanceof SpError) { const h: any = new HttpError(e.status === 429 ? 429 : e.status === 404 ? 404 : e.status >= 500 ? 503 : 409, publicCode(e)); h.fields = e.fields; throw h; } throw e; }
}
