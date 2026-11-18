import { error, info } from './log';
// Prestataire d'encaissement carte (jamais nomme dans l'interface).
const base = () => process.env.PROCESSOR_BASE_URL!;
async function call(path: string, mode: 'test' | 'live', init?: RequestInit) {
  const key = mode === 'live' ? process.env.PROCESSOR_API_KEY! : process.env.PROCESSOR_TEST_API_KEY!; const t0 = Date.now(); const method = init?.method ?? 'GET';
  let r: Response;
  try { r = await fetch(base() + path, { ...init, headers: { 'X-API-Key': key, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15_000) }); }
  catch (e) { error('processor.network_error', { path, method, mode, ms: Date.now() - t0, message: (e as Error).message }); throw e; }
  if (!r.ok) { const body = await r.text().catch(() => ''); error('processor.http_error', { path, method, mode, status: r.status, ms: Date.now() - t0, body: body.slice(0, 300) }); throw new Error('processor_' + r.status); }
  info('processor.ok', { path, method, mode, status: r.status, ms: Date.now() - t0 });
  return r.json();
}
export const createCharge = (mode: 'test' | 'live', b: { amount: number; title: string; customer_email?: string; description?: string }) => call('/charges', mode, { method: 'POST', body: JSON.stringify(b) });
export const getCharge = (mode: 'test' | 'live', id: string) => call('/charges/' + encodeURIComponent(id), mode);
