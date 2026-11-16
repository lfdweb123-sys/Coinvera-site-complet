import crypto from 'node:crypto';
import { db } from './firebase-admin';
// Notifie le site du marchand (signature HMAC-SHA256 dans X-Coinvera-Signature). Echec = journalise, jamais bloquant.
export async function notifyMerchant(merchantId: string, type: string, data: object) {
  const s = (await db.doc(`merchant_settings/${merchantId}`).get()).data();
  if (!s?.webhookUrl || !s.webhookSecret) return;
  const body = JSON.stringify({ type, data, createdAt: Date.now() });
  const sig = crypto.createHmac('sha256', s.webhookSecret).update(body).digest('hex');
  let status = 0;
  try { status = (await fetch(s.webhookUrl, { method: 'POST', body, redirect: 'error', signal: AbortSignal.timeout(8000),
    headers: { 'Content-Type': 'application/json', 'X-Coinvera-Signature': sig } })).status; } catch {}
  await db.collection('webhook_events').add({ merchantId, type, status, createdAt: new Date() });
}
export function safeUrl(u: string) {   // anti-SSRF basique : https obligatoire, pas d'IP ni de nom interne
  const x = new URL(u);
  if (x.protocol !== 'https:' || /^(localhost|.*\.local|.*\.internal)$/i.test(x.hostname) || /^[\d.]+$/.test(x.hostname) || x.hostname.includes(':')) throw new Error('unsafe_url');
  return x.toString();
}
