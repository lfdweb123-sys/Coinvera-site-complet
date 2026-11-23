// Relais Bybit à IP fixe. Tourne sur un petit serveur (VPS) dont l'IP est enregistrée dans la clé API Bybit.
// Vercel n'a PAS la clé Bybit : il envoie ici une demande signée (HMAC), le relais la contrôle puis appelle Bybit.
// Sécurité : secret partagé + horodatage (60 s) + anti-rejeu + liste fermée de routes + plafond de montant par retrait.
import http from 'node:http';
import crypto from 'node:crypto';
const { BYBIT_API_KEY, BYBIT_API_SECRET, RELAY_SECRET } = process.env;
const BASE = process.env.BYBIT_BASE_URL || 'https://api.bybit.com', PORT = Number(process.env.PORT || 8787), MAX_AMOUNT = Number(process.env.RELAY_MAX_AMOUNT || 500);
if (!BYBIT_API_KEY || !BYBIT_API_SECRET || !RELAY_SECRET || RELAY_SECRET.length < 32) { console.error('Variables requises : BYBIT_API_KEY, BYBIT_API_SECRET, RELAY_SECRET (32 caractères minimum)'); process.exit(1); }
const ROUTES = new Set(['POST /v5/asset/withdraw/create', 'GET /v5/asset/withdraw/query-record', 'GET /v5/asset/coin/query-info']);
const seen = new Map();   // signature -> expiration (anti-rejeu)
const send = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
async function bybit(method, path, payload) {
  const ts = Date.now().toString(), rw = '5000';
  const qs = method === 'GET' ? new URLSearchParams(payload).toString() : JSON.stringify(payload);
  const sign = crypto.createHmac('sha256', BYBIT_API_SECRET).update(ts + BYBIT_API_KEY + rw + qs).digest('hex');
  const r = await fetch(BASE + path + (method === 'GET' ? '?' + qs : ''), { method, body: method === 'POST' ? qs : undefined, signal: AbortSignal.timeout(15_000),
    headers: { 'Content-Type': 'application/json', 'X-BAPI-API-KEY': BYBIT_API_KEY, 'X-BAPI-TIMESTAMP': ts, 'X-BAPI-RECV-WINDOW': rw, 'X-BAPI-SIGN': sign } });
  return r.json();
}
http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true });
    if (req.method !== 'POST' || req.url !== '/bybit') return send(res, 404, { error: 'not_found' });
    const chunks = []; let size = 0;
    for await (const c of req) { size += c.length; if (size > 4096) return send(res, 413, { error: 'too_large' }); chunks.push(c); }
    const raw = Buffer.concat(chunks).toString('utf8'), ts = String(req.headers['x-relay-ts'] || ''), sig = String(req.headers['x-relay-sig'] || '');
    const good = crypto.createHmac('sha256', RELAY_SECRET).update(ts + '.' + raw).digest('hex');
    const a = Buffer.from(good), b = Buffer.from(sig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return send(res, 401, { error: 'bad_signature' });
    if (!/^\d{13}$/.test(ts) || Math.abs(Date.now() - Number(ts)) > 60_000) return send(res, 401, { error: 'stale' });
    const now = Date.now(); for (const [k, v] of seen) if (v < now) seen.delete(k);
    if (seen.has(sig)) return send(res, 409, { error: 'replay' }); seen.set(sig, now + 120_000);
    const { method, path, payload } = JSON.parse(raw);
    if (!ROUTES.has(`${method} ${path}`) || typeof payload !== 'object' || !payload) return send(res, 403, { error: 'route_not_allowed' });
    if (path.endsWith('/create')) {
      const amt = Number(payload.amount);
      if (!(amt > 0) || amt > MAX_AMOUNT) return send(res, 403, { error: 'amount_over_cap', cap: MAX_AMOUNT });
      if (!payload.address || !payload.requestId) return send(res, 400, { error: 'invalid_request' });
    }
    console.log(JSON.stringify({ at: new Date().toISOString(), path, requestId: payload.requestId ?? null, amount: payload.amount ?? null }));
    return send(res, 200, await bybit(method, path, payload));
  } catch (e) { console.error('relay_error', e?.message); return send(res, 502, { error: 'relay_error' }); }
}).listen(PORT, () => console.log('bybit-relay en écoute sur', PORT));
