import crypto from 'node:crypto';
import { db } from '../firebase-admin';
import { HttpError } from '../auth';
import { warn } from '../log';
import { ci } from './cryptoinfra';
import { adult, toProvider, IdentityInput } from './identity';
// Titulaire de carte : l'identifiant envoyé au prestataire est un nombre de 5 à 10 chiffres, généré une fois par utilisateur (jamais l'uid Firebase).
export const holderRef = (uid: string) => db.doc(`card_holders/${uid}`);
export async function getHolder(uid: string) { const s = await holderRef(uid).get(); return s.exists ? (s.data() as Record<string, any>) : null; }
async function newExternalId(uid: string): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const id = String(crypto.randomInt(100_000_000, 1_000_000_000));
    try { await db.doc(`card_holder_ids/${id}`).create({ uid, createdAt: Date.now() }); return id; } catch { /* déjà pris : on retire */ }
  }
  throw new HttpError(500, 'id_generation_failed');
}
export async function registerHolder(uid: string, email: string, id: IdentityInput) {
  if (!adult(id.dateOfBirth)) throw new HttpError(400, 'underage');
  let h = await getHolder(uid);
  if (!h) {
    const externalId = await newExternalId(uid);
    h = { merchantId: uid, externalId, email, firstName: id.firstName, lastName: id.lastName, registered: false, kycStatus: 'none', createdAt: Date.now() };
    try { await holderRef(uid).create(h); } catch { h = await getHolder(uid); }   // deux demandes simultanées : on garde la première
  }
  if (h!.registered) return h!;
  // Les deux appels sont idempotents côté prestataire : on peut les rejouer jusqu'à réussite. L'identité complète est renvoyée à chaque tentative (jamais stockée).
  await ci('POST', '/v1/users', { body: { external_user_id: h!.externalId } });
  try { await ci('POST', '/v1/cards/holders', { body: { user_id: h!.externalId, email: h!.email, ...toProvider(id) } }); }
  catch (e) { if ((e as { code?: string }).code === 'incomplete_identity') warn('cards.holder_incomplete_identity', { details: JSON.stringify((e as { details?: unknown }).details ?? null).slice(0, 300) }); throw e; }
  await holderRef(uid).update({ registered: true, firstName: id.firstName, lastName: id.lastName });
  return { ...h!, registered: true };
}
export async function requireHolder(uid: string) { const h = await getHolder(uid); if (!h?.registered) throw new HttpError(409, 'card_holder_required'); return h; }
// Vérification d'identité hébergée par le prestataire (/v1/kyc/*) : le verdict est relu à la source, jamais déduit.
export async function startKyc(uid: string) {
  const h = await requireHolder(uid); const r = await ci('POST', '/v1/kyc/start', { body: { user_id: h.externalId, language: 'fr' } });
  await holderRef(uid).update({ kycStatus: r.data.status }); return { status: r.data.status as string, url: (r.data.url ?? null) as string | null };
}
export async function readKyc(uid: string) {
  const h = await requireHolder(uid); const r = await ci('GET', '/v1/kyc/status', { query: { user_id: h.externalId } });
  if (r.data.status !== h.kycStatus) await holderRef(uid).update({ kycStatus: r.data.status }); return r.data.status as string;
}
