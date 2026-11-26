import { HttpError } from '../auth';
import { warn } from '../log';
// Client de l'API revendeur ProxNum (https://proxnum.com/api/v1, authentification Bearer). Serveur uniquement : la clé ne quitte jamais le serveur.
// `ambiguous` = la requête d'achat a peut-être été exécutée malgré l'échec (délai dépassé, erreur 5xx) : on ne libère alors JAMAIS les fonds à l'aveugle (voir orders.ts, état « review »).
export class PxError extends HttpError { constructor(status: number, code: string, public ambiguous = false) { super(status, code); } }
export const proxnumEnabled = () => !!process.env.PROXNUM_API_KEY;
const base = () => (process.env.PROXNUM_BASE_URL || 'https://proxnum.com/api/v1').replace(/\/+$/, '');
export type PxRes = { status: number; j: any };
// Réponses sans débit garanti par la référence (rentals : « unavailable ou provider_unreachable (503, aucun débit) »).
const NO_DEBIT_5XX = new Set(['unavailable', 'provider_unreachable']);
// Code d'erreur normalisé : « code » pour les numéros virtuels, « error » pour les locations.
export const codeOf = (r: PxRes) => String(r.j?.code ?? r.j?.error ?? 'provider_error');
export const isOk = (r: PxRes) => r.status < 400 && (r.j?.success === true || r.j?.ok === true);
export async function px(method: 'GET' | 'POST', path: string, o: { query?: Record<string, string | number | undefined>; body?: unknown } = {}): Promise<PxRes> {
  const key = process.env.PROXNUM_API_KEY; if (!key) throw new PxError(503, 'proxnum_disabled');
  const url = new URL(base() + path); for (const [k, v] of Object.entries(o.query ?? {})) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  let r: Response;
  try { r = await fetch(url, { method, headers: { Authorization: `Bearer ${key}`, Accept: 'application/json', 'Content-Type': 'application/json' }, body: o.body === undefined ? undefined : JSON.stringify(o.body), signal: AbortSignal.timeout(20_000), cache: 'no-store' }); }
  catch (e) { warn('proxnum.network', { path, message: (e as Error).message }); throw new PxError(502, 'provider_unreachable', method === 'POST'); }
  const j = await r.json().catch(() => null); const res = { status: r.status, j: j && typeof j === 'object' ? j : {} };
  if (r.status >= 500 && !NO_DEBIT_5XX.has(codeOf(res))) { warn('proxnum.http_5xx', { path, status: r.status }); throw new PxError(502, 'provider_unreachable', method === 'POST'); }
  return res;
}
// Erreur « définitive » (rien n'a été débité chez ProxNum) à partir d'une réponse d'échec.
export const failure = (r: PxRes) => { const c = codeOf(r); return new PxError(r.status >= 400 && r.status < 500 ? r.status : 409, c === 'insufficient_balance' || c === 'insufficient_funds' ? 'service_unavailable' : c); };
// Solde du compte revendeur chez ProxNum vide : l'utilisateur voit « service indisponible », l'exploitant reçoit l'alerte dans les journaux.
export const underfunded = (c: string) => c === 'insufficient_balance' || c === 'insufficient_funds';
