// Client de l'API CryptoInfra (cartes). Serveur uniquement : la clé API ne doit jamais atteindre le navigateur.
import { HttpError } from '../auth';
import { error, warn } from '../log';
export const CORE = () => process.env.CARDS_CORE_ID ?? 'core-1';
// Réponse d'erreur du prestataire (code stable dans `code`, repris tel quel côté interface).
export class CiError extends HttpError { constructor(status: number, code: string, public details?: unknown) { super(status, code); } }
// Aucune réponse exploitable (timeout, 5xx) : l'état de l'opération est INCONNU — ne jamais rembourser sur cette base.
export class CiUnknown extends HttpError { constructor() { super(502, 'cards_provider_unreachable'); } }
// Refus définitif : rien n'a été débité côté prestataire (400/409/503 documentés) — la réservation peut être libérée.
export const isDefinitive = (e: unknown) => e instanceof CiError && [400, 401, 403, 404, 409, 410, 422, 429, 503].includes(e.status);
type Q = Record<string, string | number | undefined>;
export async function ci(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, o: { query?: Q; body?: unknown; timeoutMs?: number } = {}): Promise<{ status: number; data: any }> {
  const key = process.env.CRYPTOINFRA_API_KEY; if (!key) throw new HttpError(503, 'cards_not_configured');
  const qs = Object.entries(o.query ?? {}).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]);
  const url = (process.env.CRYPTOINFRA_BASE_URL ?? 'https://api.cryptoinfra.build') + path + (qs.length ? '?' + new URLSearchParams(qs).toString() : '');
  let r: Response;
  try { r = await fetch(url, { method, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: o.body === undefined ? undefined : JSON.stringify(o.body), signal: AbortSignal.timeout(o.timeoutMs ?? 20_000), cache: 'no-store' }); }
  catch (e) { warn('cards.ci_unreachable', { method, path, message: (e as Error).message }); throw new CiUnknown(); }
  const text = await r.text(); let data: any = {}; try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!r.ok) {
    warn('cards.ci_error', { method, path, status: r.status, code: data?.error });
    if (r.status === 401) { error('cards.ci_key_rejected', { path, hint: 'CRYPTOINFRA_API_KEY refusée : vérifier la clé (ck_live_…) et son environnement' }); throw new CiError(503, 'cards_not_configured'); }
    if (r.status === 403) error('cards.ci_account_blocked', { path, code: data?.error });
    if (r.status >= 500 && r.status !== 503) throw new CiUnknown();
    throw new CiError(r.status, String(data?.error ?? 'provider_error'), data?.details);
  }
  return { status: r.status, data };
}
