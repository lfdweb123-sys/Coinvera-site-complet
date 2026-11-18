import crypto from 'node:crypto';
import { log } from './log';
// API V5 : signature = HMAC_SHA256(secret, timestamp + apiKey + recvWindow + corps JSON ou query string)
async function bybit(method: 'GET' | 'POST', path: string, payload: Record<string, unknown>) {
  const ts = Date.now().toString(), rw = '5000', key = process.env.BYBIT_API_KEY!;
  const qs = method === 'GET' ? new URLSearchParams(payload as Record<string, string>).toString() : JSON.stringify(payload);
  const sign = crypto.createHmac('sha256', process.env.BYBIT_API_SECRET!).update(ts + key + rw + qs).digest('hex');
  const r = await fetch(process.env.BYBIT_BASE_URL + path + (method === 'GET' ? '?' + qs : ''), {
    method, body: method === 'POST' ? qs : undefined, signal: AbortSignal.timeout(15_000),
    headers: { 'Content-Type': 'application/json', 'X-BAPI-API-KEY': key, 'X-BAPI-TIMESTAMP': ts, 'X-BAPI-RECV-WINDOW': rw, 'X-BAPI-SIGN': sign } });
  const j = (await r.json()) as { retCode: number; retMsg: string; result: any };
  log(j.retCode === 0 ? 'info' : 'warn', 'bybit.response', { path, httpStatus: r.status, retCode: j.retCode, retMsg: j.retMsg });
  return j;
}
// requestId = id unique du retrait : rejouer la meme demande ne cree pas de doublon
export const createWithdrawal = (w: { coin: string; chain: string; address: string; amount: string; requestId: string }) =>
  bybit('POST', '/v5/asset/withdraw/create', { ...w, timestamp: Date.now(), accountType: 'FUND', forceChain: 1 });
export const queryWithdrawal = (withdrawID: string) => bybit('GET', '/v5/asset/withdraw/query-record', { withdrawID });
