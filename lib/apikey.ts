import crypto from 'node:crypto';
import { db } from './firebase-admin';
import { HttpError } from './auth';
import { signPayload } from './sign';
import { info, warn } from './log';
import { Timestamp } from 'firebase-admin/firestore';
import { ipOf, rateLimit } from './ratelimit';
// HMAC exige que le serveur connaisse le secret : on le stocke CHIFFRE (AES-256-GCM), jamais en clair.
const K = () => Buffer.from(process.env.API_SECRET_ENC_KEY!, 'hex');
export const enc = (s: string) => { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', K(), iv);
  const e = Buffer.concat([c.update(s, 'utf8'), c.final()]); return [iv, c.getAuthTag(), e].map(b => b.toString('base64')).join('.'); };
export const dec = (s: string) => { const [iv, tag, e] = s.split('.').map(x => Buffer.from(x, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', K(), iv); d.setAuthTag(tag); return Buffer.concat([d.update(e), d.final()]).toString('utf8'); };
export function newKeyPair() { return { publicKey: 'cv_pk_' + crypto.randomBytes(12).toString('hex'), secret: 'cv_sk_' + crypto.randomBytes(32).toString('hex') }; }
// Signature : HMAC-SHA256(secret, `${ts}.${nonce}.${METHOD}.${path}.${sha256(body)}`)
export async function verifyApiRequest(req: Request, rawBody: string) {
  const key = req.headers.get('x-api-key'), ts = req.headers.get('x-timestamp'), nonce = req.headers.get('x-nonce'), sig = req.headers.get('x-signature');
  if (!key || !ts || !nonce || !sig) throw new HttpError(401, 'missing_auth_headers');
  if (key.length > 64 || nonce.length > 64 || sig.length !== 64 || !/^[\w.-]+$/.test(nonce)) throw new HttpError(401, 'missing_auth_headers');
  await rateLimit('apiip_' + ipOf(req), 600, 60);   // avant toute lecture Firestore : une rafale de fausses clés ne coûte rien
  const t = Number(ts); if (!Number.isFinite(t) || Math.abs(Date.now() - t) > 5 * 60_000) throw new HttpError(401, 'timestamp_out_of_range');
  const snap = await db.collection('api_keys').where('publicKey', '==', key).limit(1).get();
  const doc = snap.docs[0];
  if (!doc || doc.data().status !== 'active') { warn('api.auth_failed', { reason: 'invalid_or_revoked_key', method: req.method }); throw new HttpError(401, 'invalid_or_revoked_key'); }
  const k = doc.data();
  const path = new URL(req.url).pathname.replace(/^\/api(?=\/)/, '');   // chemin signe canonique : /v1/... (identique sur api.coinvera.me et sur /api/...)
  const expected = signPayload(dec(k.secretEnc), ts, nonce, req.method, path, rawBody);
  const a = Buffer.from(expected), b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) { warn('api.auth_failed', { reason: 'bad_signature', merchantId: k.merchantId, path }); throw new HttpError(401, 'bad_signature'); }
  // Anti-rejeu : un nonce ne sert qu'une fois (create echoue s'il existe)
  await db.doc(`idempotency_records/nonce_${doc.id}_${nonce}`).create({ expiresAt: Date.now() + 10 * 60_000, ttl: Timestamp.fromMillis(Date.now() + 10 * 60_000) })
    .catch(() => { warn('api.auth_failed', { reason: 'nonce_reused', merchantId: k.merchantId }); throw new HttpError(401, 'nonce_reused'); });
  await rateLimit('apikey_' + doc.id, 300, 60);   // par clé, après signature valide
  await doc.ref.update({ lastUsedAt: new Date() });
  await db.collection('api_usage').add({ merchantId: k.merchantId, keyId: doc.id, method: req.method, endpoint: path, status: 'authenticated', createdAt: new Date() });
  info('api.request', { merchantId: k.merchantId, keyId: doc.id, mode: k.mode, method: req.method, path });
  return { keyId: doc.id, merchantId: k.merchantId as string, mode: k.mode as 'test' | 'live' };
}
