// Prestataire d'encaissement carte. Nom volontairement neutre : jamais affiche dans l'interface.
const base = () => process.env.PROCESSOR_BASE_URL!;
async function call(path: string, mode: 'test' | 'live', init?: RequestInit) {
  const key = mode === 'live' ? process.env.PROCESSOR_API_KEY! : process.env.PROCESSOR_TEST_API_KEY!;
  const r = await fetch(base() + path, { ...init, headers: { 'X-API-Key': key, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error('processor_' + r.status);
  return r.json();
}
export const createCharge = (mode: 'test' | 'live', b: { amount: number; title: string; customer_email?: string; description?: string }) =>
  call('/charges', mode, { method: 'POST', body: JSON.stringify(b) });
export const getCharge = (mode: 'test' | 'live', id: string) => call('/charges/' + encodeURIComponent(id), mode);
