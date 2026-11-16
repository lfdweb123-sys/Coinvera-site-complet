import crypto from 'node:crypto';
export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const signPayload = (secret: string, ts: string, nonce: string, method: string, path: string, body: string) =>
  crypto.createHmac('sha256', secret).update(`${ts}.${nonce}.${method}.${path}.${sha256(body)}`).digest('hex');
