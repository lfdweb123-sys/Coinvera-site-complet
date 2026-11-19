import { describe, expect, it } from 'vitest';
import { loadCreds } from '@/lib/firebase-admin';
const KEY = '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n';
describe('configuration Firebase', () => {
  const base = { FIREBASE_PROJECT_ID: 'p', FIREBASE_CLIENT_EMAIL: 'e@p.iam.gserviceaccount.com' };
  it('accepte la cle avec \\n echappes, guillemets ou vrais retours a la ligne', () => {
    expect(loadCreds({ ...base, FIREBASE_PRIVATE_KEY: KEY.replace(/\n/g, '\\n') }).privateKey).toBe(KEY);
    expect(loadCreds({ ...base, FIREBASE_PRIVATE_KEY: '"' + KEY.replace(/\n/g, '\\n') + '"' }).privateKey).toContain('BEGIN PRIVATE KEY-----\nABC');
    expect(loadCreds({ ...base, FIREBASE_PRIVATE_KEY: KEY }).privateKey).toContain('ABC');
  });
  it('accepte le JSON complet ou son base64', () => {
    const j = JSON.stringify({ project_id: 'p', client_email: 'e', private_key: KEY });
    expect(loadCreds({ FIREBASE_SERVICE_ACCOUNT: j }).projectId).toBe('p'); expect(loadCreds({ FIREBASE_SERVICE_ACCOUNT: Buffer.from(j).toString('base64') }).privateKey).toContain('ABC');
  });
  it('explique clairement ce qui manque', () => { expect(() => loadCreds(base)).toThrow('FIREBASE_PRIVATE_KEY'); });
});
