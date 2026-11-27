import crypto from 'node:crypto';
import { HttpError } from '../auth';
import { warn } from '../log';
// Client de l'API partenaire eSIM Access (https://docs.esimaccess.com). Serveur uniquement : le code d'accès ne quitte jamais le serveur.
// Authentification : en-tête RT-AccessCode ; si ESIMACCESS_SECRET_KEY est défini, la requête est en plus signée (HMAC-SHA256, voir « Authentication methods » de la documentation).
// `ambiguous` = la requête a peut-être été exécutée malgré l'échec (délai dépassé, erreur 5xx) : on ne libère alors JAMAIS les fonds à l'aveugle (voir orders.ts, état « review »).
export class EsError extends HttpError { constructor(status: number, code: string, public ambiguous = false) { super(status, code); } }
export const esimEnabled = () => !!process.env.ESIMACCESS_ACCESS_CODE;
const base = () => (process.env.ESIMACCESS_BASE_URL || 'https://api.esimaccess.com/api/v1/open').replace(/\/+$/, '');
export type EsRes = { status: number; j: any };
// Codes d'erreur dont l'issue est incertaine (erreur serveur, système occupé) : l'ordre a pu être exécuté.
export const AMBIGUOUS = new Set(['000001', '900001']);
export const codeOf = (r: EsRes) => String(r.j?.errorCode ?? 'provider_error');
export const isOk = (r: EsRes) => r.status < 400 && (r.j?.success === true || r.j?.success === 'true');
// Signature HMAC : horodatage + identifiant de requête + code d'accès + corps exact envoyé, haché avec la clé secrète (hexadécimal minuscule).
const headersFor = (access: string, body: string): Record<string, string> => {
  const h: Record<string, string> = { 'RT-AccessCode': access, 'Content-Type': 'application/json', Accept: 'application/json' };
  const secret = process.env.ESIMACCESS_SECRET_KEY;
  if (secret) { const ts = String(Date.now()), id = crypto.randomUUID().replace(/-/g, ''); h['RT-Timestamp'] = ts; h['RT-RequestID'] = id; h['RT-Signature'] = crypto.createHmac('sha256', secret).update(ts + id + access + body).digest('hex'); }
  return h;
};
export async function es(path: string, body: Record<string, unknown> = {}, o: { write?: boolean; timeoutMs?: number } = {}): Promise<EsRes> {
  const access = process.env.ESIMACCESS_ACCESS_CODE; if (!access) throw new EsError(503, 'esim_disabled');
  const raw = JSON.stringify(body); let r: Response;
  try { r = await fetch(base() + path, { method: 'POST', headers: headersFor(access, raw), body: raw, signal: AbortSignal.timeout(o.timeoutMs ?? 20_000), cache: 'no-store' }); }
  catch (e) { warn('esim.network', { path, message: (e as Error).message }); throw new EsError(502, 'provider_unreachable', !!o.write); }
  const j = await r.json().catch(() => null); const res = { status: r.status, j: j && typeof j === 'object' ? j : {} };
  if (r.status >= 500) { warn('esim.http_5xx', { path, status: r.status }); throw new EsError(502, 'provider_unreachable', !!o.write); }
  return res;
}
// Codes du prestataire -> codes Coinvera (messages dans errors.ts). Une erreur « définitive » : rien n'a été débité chez le prestataire.
export const underfunded = (c: string) => c === '200007';
export const failure = (r: EsRes) => {
  const c = codeOf(r), st = r.status >= 400 && r.status < 500 ? r.status : 409;
  if (c === '200007') return new EsError(st, 'service_unavailable');                 // solde revendeur vide : l'utilisateur voit « indisponible », l'exploitant reçoit l'alerte dans les journaux
  if (c === '200005' || c === '200006') return new EsError(st, 'price_changed');
  if (c === '200011') return new EsError(st, 'no_stock');
  if (c === '310241' || c === '310243') return new EsError(st, 'package_unavailable');
  if (c === '200002') return new EsError(st, 'cancel_rejected');
  if (c === '310272' || c === '310403') return new EsError(404, 'not_found');
  return new EsError(st, 'service_unavailable');
};
