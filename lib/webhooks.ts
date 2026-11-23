import crypto from 'node:crypto';
import { db } from './firebase-admin';
import { webhookUrlsOf } from './webhook-urls';
import { assertPublicHost } from './ssrf';
export { safeUrl } from './webhook-urls';
// Notifie les sites du marchand (signature HMAC-SHA256 dans X-Coinvera-Signature, même secret pour toutes les URL).
// Livraison en parallèle vers chaque URL : une URL lente ou en échec ne retarde ni ne bloque les autres. Echec = journalise, jamais bloquant.
export async function notifyMerchant(merchantId: string, type: string, data: object) {
  const s = (await db.doc(`merchant_settings/${merchantId}`).get()).data();
  const urls = webhookUrlsOf(s);
  if (!urls.length || !s?.webhookSecret) return;
  const body = JSON.stringify({ type, data, createdAt: Date.now() });
  const sig = crypto.createHmac('sha256', s.webhookSecret).update(body).digest('hex');
  await Promise.allSettled(urls.map(async url => {
    let status = 0;
    try { await assertPublicHost(url); status = (await fetch(url, { method: 'POST', body, redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: { 'Content-Type': 'application/json', 'X-Coinvera-Signature': sig } })).status; } catch {}
    let host = ''; try { host = new URL(url).host; } catch {}
    await db.collection('webhook_events').add({ merchantId, type, status, host, createdAt: new Date() });
  }));
}
