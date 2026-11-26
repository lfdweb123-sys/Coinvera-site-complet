import crypto from 'node:crypto';
import { log } from './log';
// API V5 : signature = HMAC_SHA256(secret, timestamp + apiKey + recvWindow + corps JSON ou query string)
// Si BYBIT_RELAY_URL est défini, l'appel passe par le relais à IP fixe (tools/bybit-relay) : la clé Bybit n'est alors jamais sur Vercel.
async function viaRelay(method: 'GET' | 'POST', path: string, payload: Record<string, unknown>) {
  const secret = process.env.BYBIT_RELAY_SECRET!, ts = Date.now().toString(), body = JSON.stringify({ method, path, payload });
  const sig = crypto.createHmac('sha256', secret).update(ts + '.' + body).digest('hex');
  const r = await fetch(process.env.BYBIT_RELAY_URL!.replace(/\/$/, '') + '/bybit', { method: 'POST', body, signal: AbortSignal.timeout(20_000), headers: { 'Content-Type': 'application/json', 'x-relay-ts': ts, 'x-relay-sig': sig } });
  const j = (await r.json().catch(() => ({}))) as { retCode?: number; retMsg?: string; result?: any; error?: string };
  if (typeof j.retCode !== 'number') throw new Error('relay_' + (j.error ?? r.status));   // le relais a refusé ou est injoignable : état inconnu, jamais traité comme un refus de Bybit
  log(j.retCode === 0 ? 'info' : 'warn', 'bybit.response', { path, via: 'relay', retCode: j.retCode, retMsg: j.retMsg });
  return j as { retCode: number; retMsg: string; result: any };
}
export const bybitConfigured = () => !!((process.env.BYBIT_RELAY_URL && process.env.BYBIT_RELAY_SECRET) || (process.env.BYBIT_API_KEY && process.env.BYBIT_API_SECRET && process.env.BYBIT_BASE_URL));
async function bybit(method: 'GET' | 'POST', path: string, payload: Record<string, unknown>) {
  if (process.env.BYBIT_RELAY_URL && process.env.BYBIT_RELAY_SECRET) return viaRelay(method, path, payload);
  const ts = Date.now().toString(), rw = '5000', key = process.env.BYBIT_API_KEY!;
  const qs = method === 'GET' ? new URLSearchParams(payload as Record<string, string>).toString() : JSON.stringify(payload);
  const sign = crypto.createHmac('sha256', process.env.BYBIT_API_SECRET!).update(ts + key + rw + qs).digest('hex');
  const r = await fetch(process.env.BYBIT_BASE_URL + path + (method === 'GET' ? '?' + qs : ''), {
    method, body: method === 'POST' ? qs : undefined, signal: AbortSignal.timeout(15_000),
    headers: { 'Content-Type': 'application/json', 'X-BAPI-API-KEY': key, 'X-BAPI-TIMESTAMP': ts, 'X-BAPI-RECV-WINDOW': rw, 'X-BAPI-SIGN': sign } });
  // Réponse non JSON (page de blocage, proxy, panne) : erreur explicite avec le code HTTP et le début du texte, jamais « Expected property name… ». Le résultat reste « état inconnu » pour un retrait.
  const text = await r.text(); let j: { retCode: number; retMsg: string; result: any };
  try { j = JSON.parse(text); } catch { throw new Error(`bybit_reponse_illisible (HTTP ${r.status}) : ${text.replace(/\s+/g, ' ').slice(0, 120)}`); }
  if (typeof j?.retCode !== 'number') throw new Error(`bybit_reponse_inattendue (HTTP ${r.status})`);
  log(j.retCode === 0 ? 'info' : 'warn', 'bybit.response', { path, httpStatus: r.status, retCode: j.retCode, retMsg: j.retMsg });
  return j;
}
// requestId = id unique du retrait : rejouer la meme demande ne cree pas de doublon
export const createWithdrawal = (w: { coin: string; chain: string; address: string; amount: string; requestId: string }) =>
  bybit('POST', '/v5/asset/withdraw/create', { ...w, timestamp: Date.now(), accountType: 'FUND', forceChain: 1 });
export const queryWithdrawal = (withdrawID: string) => bybit('GET', '/v5/asset/withdraw/query-record', { withdrawID });
// Réseaux et frais de retrait d'une pièce (lecture seule) : sert à facturer à l'utilisateur les frais RÉELS de Bybit.
export const coinInfo = (coin: string) => bybit('GET', '/v5/asset/coin/query-info', { coin });
