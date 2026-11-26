import crypto from 'node:crypto';
// Signature des webhooks FeexPay : HMAC-SHA256 hex de « {x-feexpay-timestamp}.{x-feexpay-delivery-id}.{corps brut} » avec le secret fxp_whsec_… (préfixe compris).
// x-feexpay-signature : une ou plusieurs valeurs « v1=<hex> » séparées par des virgules (deux pendant un renouvellement de secret). Tolérance d'horloge : 5 minutes.
export const TOLERANCE_S = 300;
export const sign = (secret: string, timestamp: string, deliveryId: string, raw: string | Buffer) => crypto.createHmac('sha256', secret).update(`${timestamp}.${deliveryId}.`).update(raw).digest('hex');
export function verifyFeexWebhook(raw: string, h: { timestamp: string | null; deliveryId: string | null; signature: string | null }, secret: string, nowMs = Date.now()): boolean {
  if (!h.timestamp || !h.deliveryId || !h.signature || !/^\d{1,12}$/.test(h.timestamp)) return false;
  if (Math.abs(Math.floor(nowMs / 1000) - Number(h.timestamp)) > TOLERANCE_S) return false;
  const exp = Buffer.from(sign(secret, h.timestamp, h.deliveryId, raw));
  return h.signature.split(',').some(p => { const [v, val] = p.trim().split('='); if (v !== 'v1' || !val) return false; const b = Buffer.from(val); return b.length === exp.length && crypto.timingSafeEqual(b, exp); });
}
