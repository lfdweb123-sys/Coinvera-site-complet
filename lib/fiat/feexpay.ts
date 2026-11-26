import { HttpError } from '../auth';
import { error, info } from '../log';
import type { Method } from './methods';
import { alertRefill } from '../cards/refill';
// Client FeexPay API v2. La clé (FEEXPAY_API_KEY) et l'id de boutique (FEEXPAY_SHOP_ID) viennent de l'environnement ; jamais journalisés.
// Règle de sécurité : la réponse de création est TOUJOURS « PENDING », et un webhook n'est qu'un signal : on ne crédite qu'après avoir relu le statut chez FeexPay (statusOf).
const BASE = () => (process.env.FEEXPAY_BASE_URL ?? 'https://api-v2.feexpay.me').replace(/\/$/, '');
const REQ = '/api/transactions/public/requesttopay/';
// Chemin de lecture du statut (« Statut des payins » dans la documentation FeexPay) ; {reference} est remplacé. Modifiable sans toucher au code.
const STATUS_PATH = () => process.env.FEEXPAY_STATUS_PATH ?? '/api/transactions/public/single/status/{reference}';
// Codes d'erreur FeexPay (« Codes d'erreur » de la documentation) -> codes Coinvera. Les erreurs de configuration (clé, boutique, IP non autorisée) préviennent l'administrateur.
export function mapError(status: number, code: string, message: string): HttpError {
  const c = code.toUpperCase();
  if (['ERR_INVALID_API_KEY', 'ERR_SHOP_NOT_FOUND', 'ERR_IP_NOT_AUTHORIZED', 'IP_NOT_ALLOWED', 'UNAUTHORIZED', 'ACCESS_DENIED'].includes(c) || status === 401 || (status === 403 && !c) || /shop (not found|is disabled)|merchant or shop/i.test(message)) {
    const d = new Date().toISOString().slice(0, 10);
    void alertRefill(`feex_cfg_${c || status}_${d}`, 'Paiements mobile money : configuration FeexPay à corriger', [`FeexPay a refusé une requête du site (${c || status}${message ? ' : ' + message : ''}).`, c.includes('IP') ? 'L’adresse IP du serveur doit être autorisée dans le tableau de bord FeexPay (liste blanche). Sur Vercel les adresses changent : désactivez la liste blanche ou utilisez une adresse sortante fixe.' : 'Vérifiez FEEXPAY_API_KEY et FEEXPAY_SHOP_ID.']).catch(() => {});
    return new HttpError(503, 'fiat_unavailable');
  }
  if (c === 'ERR_INVALID_PHONE_NUMBER') return new HttpError(400, 'invalid_phone');
  if (c === 'ERR_INVALID_AMOUNT') return new HttpError(400, 'amount_invalid');
  if (c === 'ERR_NETWORK_UNAVAILABLE' || c === 'NETWORK_UNAVAILABLE') return new HttpError(503, 'network_unavailable');
  if (c === 'ERR_DUPLICATE_TRANSACTION') return new HttpError(409, 'duplicate_payment');
  if (status === 429 || status >= 500) return new HttpError(status === 429 ? 429 : 502, status === 429 ? 'provider_busy' : 'provider_unavailable');
  return new HttpError(400, 'payment_rejected');
}
export const feexConfigured = () => !!(process.env.FEEXPAY_API_KEY && process.env.FEEXPAY_SHOP_ID);
export const shopId = () => process.env.FEEXPAY_SHOP_ID!;
async function call(path: string, init?: RequestInit): Promise<any> {
  if (!feexConfigured()) throw new HttpError(503, 'fiat_unavailable');
  const t0 = Date.now(), method = init?.method ?? 'GET'; let r: Response;
  try { r = await fetch(BASE() + path, { ...init, headers: { Authorization: `Bearer ${process.env.FEEXPAY_API_KEY}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20_000), cache: 'no-store' }); }
  catch (e) { error('feexpay.network_error', { path: path.split('?')[0], method, ms: Date.now() - t0, message: (e as Error).message }); throw new HttpError(502, 'provider_unavailable'); }
  const text = await r.text().catch(() => ''); let j: any = {}; try { j = text ? JSON.parse(text) : {}; } catch { /* corps non JSON */ }
  if (!r.ok) { const code = String(j?.code ?? j?.error?.code ?? ''), message = Array.isArray(j?.message) ? j.message.join(' ') : String(j?.message ?? '');
    error('feexpay.http_error', { path: path.split('?')[0], method, status: r.status, code, ms: Date.now() - t0, body: text.slice(0, 300) });
    throw mapError(r.status, code, message); }
  info('feexpay.ok', { path: path.split('?')[0], method, status: r.status, ms: Date.now() - t0 });
  return j;
}
export type Init = { reference: string | null; status: string; paymentUrl: string | null; bank: { name: string; number: string; bankName: string; expiresAt: string | null } | null; amountExpected: number | null; requiresOtp: boolean; message: string | null };
export function normalizeInit(j: any): Init {
  const b = j?.bank_account;
  return { reference: j?.reference ? String(j.reference) : j?.order_id ? String(j.order_id) : j?.transref ? String(j.transref) : null, status: String(j?.status ?? 'PENDING').toUpperCase(),
    paymentUrl: typeof (j?.payment_url ?? j?.url) === 'string' && /^https:\/\//.test(j.payment_url ?? j.url) ? String(j.payment_url ?? j.url) : null,
    bank: b?.account_number ? { name: String(b.account_name ?? ''), number: String(b.account_number), bankName: String(b.bank_name ?? ''), expiresAt: b.expires_at ? String(b.expires_at) : null } : null,
    amountExpected: Number.isFinite(Number(j?.amount_expected)) && j?.amount_expected != null ? Number(j.amount_expected) : null, requiresOtp: j?.requires_otp === true, message: typeof j?.message === 'string' ? j.message.slice(0, 200) : null };
}
const clean = (o: Record<string, any>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));
export type Body = { amount: number; phone?: string; firstName?: string; lastName?: string; email?: string; description: string; callbackInfo: string; returnUrl?: string; cancelUrl?: string; otp?: string; bankCode?: string };
export function buildBody(m: Method, b: Body) {
  const base: Record<string, any> = { shop: shopId(), amount: b.amount, description: b.description.slice(0, 40), callback_info: b.callbackInfo, first_name: b.firstName, last_name: b.lastName, email: b.email };
  if (b.phone) base.phoneNumber = b.phone;
  if (m.returnUrl) { base.return_url = b.returnUrl; if (m.id !== 'pay_with_bank_ng') base.cancel_url = b.cancelUrl; }
  if (m.flow === 'bank_redirect') { base.bank_code = b.bankCode; base.redirect_url = b.returnUrl; delete base.return_url; }
  if (m.flow === 'otp') base.otp = b.otp;
  if (m.flow === 'coris') return { ...clean(base), otp: b.otp ?? '' };       // étape 1 : otp vide ; étape 2 : même requête avec le code
  return clean(base);
}
export const initiate = async (m: Method, body: Record<string, any>) => normalizeInit(await call(REQ + m.id, { method: 'POST', body: JSON.stringify(body) }));
export const bmoConfirm = async (reference: string, otp: string) => normalizeInit(await call(REQ + 'bmo/confirm', { method: 'POST', body: JSON.stringify({ reference, otp }) }));
export const bmoCancel = async (reference: string) => { await call(REQ + 'bmo/cancel', { method: 'POST', body: JSON.stringify({ reference }) }); };
export async function banks(): Promise<{ code: string; name: string }[]> {
  const j = await call(REQ + 'pay_with_bank_ng/banks'); const l = Array.isArray(j?.banks) ? j.banks : [];
  return l.filter((x: any) => x?.code && x?.name).map((x: any) => ({ code: String(x.code), name: String(x.name) }));
}
export type Status = { status: string; reference: string | null; amount: number | null };
export function parseStatus(j: any): Status {
  const d = j?.data ?? j?.transaction ?? j; const a = Number(d?.amount ?? d?.amount_expected);
  return { status: (st => (/PEND/.test(st) ? 'PENDING' : st))(String(d?.status ?? j?.status ?? '').toUpperCase()), reference: d?.reference ? String(d.reference) : null, amount: Number.isFinite(a) && (d?.amount ?? d?.amount_expected) != null ? a : null };
}
export const statusOf = async (reference: string) => parseStatus(await call(STATUS_PATH().replace('{reference}', encodeURIComponent(reference))));

export type HistoryRow = { reference: string; status: string; amount: number | null; type: string; customId: string | null; callbackId: string | null };
// Historique des encaissements (POST /api/transactions/history, 31 jours et 500 lignes au plus) : sert au rapprochement, jamais à l'interface.
export async function history(start: string, end: string, status: 'SUCCESSFUL' | 'ALL' = 'SUCCESSFUL'): Promise<HistoryRow[]> {
  const j = await call('/api/transactions/history', { method: 'POST', body: JSON.stringify({ start_date: start, end_date: end, shop: shopId(), type: 'PAYIN', status, reseau: 'ALL' }) });
  return (Array.isArray(j?.data) ? j.data : []).map((x: any) => { const cb = x?.callback_info; const a = Number(x?.amount);
    return { reference: String(x?.reference ?? ''), status: String(x?.status ?? '').toUpperCase(), amount: Number.isFinite(a) && x?.amount != null ? a : null, type: String(x?.type ?? ''), customId: x?.custom_id ? String(x.custom_id) : null, callbackId: typeof cb === 'string' && cb ? cb : cb?.order_id ? String(cb.order_id) : cb?.id ? String(cb.id) : null }; }).filter((x: HistoryRow) => x.reference);
}
