import { z } from 'zod';
import { db } from '../firebase-admin';
import { HttpError } from '../auth';
import { notify } from '../audit';
import { info, warn } from '../log';
import { sp, spx, SpError, SpUnknown } from './client';

// Titulaire de carte = « customer » du registre ScarabPay (mode de vérification `merchant`). Un par utilisateur Coinvera, réutilisé pour toutes ses cartes (3 vivantes au plus).
// On ne garde JAMAIS le numéro de pièce d'identité ni les photos : uniquement l'identifiant ScarabPay, les 4 derniers chiffres et le verdict.
export const custRef = (uid: string) => db.doc(`scarab_customers/${uid}`);
export async function getCustomer(uid: string) { const s = await custRef(uid).get(); return s.exists ? (s.data() as Record<string, any>) : null; }

const T = z.string().trim();
const NAME = T.min(1).max(100).regex(/^[\p{L}][\p{L} .'-]*$/u);
const ID_TYPES = ['bvn', 'nin', 'passport', 'drivers_license', 'national_id', 'vnin', 'voters_card', 'ghana_card'] as const;
const TWO_SIDED = ['national_id', 'ghana_card', 'drivers_license', 'voters_card'];
const NATIONAL_DB = ['bvn', 'nin'];
const IMG = z.string().max(3_500_000).transform(s => s.replace(/^data:[^;]+;base64,/, '')).refine(s => /^[A-Za-z0-9+/=\s]+$/.test(s), 'bad_image');
const ADULT = (d: string) => { const b = new Date(d + 'T00:00:00Z'); if (isNaN(b.getTime())) return false; const t = new Date(); const a = t.getUTCFullYear() - b.getUTCFullYear() - (t.getUTCMonth() < b.getUTCMonth() || (t.getUTCMonth() === b.getUTCMonth() && t.getUTCDate() < b.getUTCDate()) ? 1 : 0); return a >= 18 && a < 120; };
export const normalizeSlug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100);

export const CUSTOMER_FIELDS = z.object({
  first_name: NAME, last_name: NAME, email: T.email().max(254), phone_number: T.regex(/^\d{4,15}$/), dial_code: T.regex(/^\+\d{1,4}$/),
  date_of_birth: T.regex(/^\d{4}-\d{2}-\d{2}$/).refine(ADULT, 'underage'), id_type: z.enum(ID_TYPES), id_number: T.min(3).max(64),
  line1: T.min(2).max(120), city: T.min(1).max(120), state: T.min(1).max(120), postal_code: T.min(1).max(20), country: T.regex(/^[A-Za-z]{3}$/).transform(s => s.toUpperCase()),
  occupation: T.min(2).max(100).transform(normalizeSlug), employment_status: T.min(2).max(50).transform(normalizeSlug), account_purpose: T.min(2).max(100).transform(normalizeSlug),
  annual_salary: T.regex(/^\d{1,12}$/), expected_monthly_volume: T.regex(/^\d{1,12}$/), place_of_birth: T.max(120).optional(),
  terms_of_service_accepted: z.literal(true), id_front_image: IMG.optional(), id_back_image: IMG.optional(),
});
// Règles qui dépendent du type de pièce (sinon le prestataire refuse en 422 et l'utilisateur ne comprend pas pourquoi).
export function checkDocs(b: { id_type: string; country: string; id_front_image?: string; id_back_image?: string }) {
  if (NATIONAL_DB.includes(b.id_type)) { if (b.country !== 'NGA') throw new HttpError(400, 'country_mismatch'); if (b.id_front_image || b.id_back_image) throw new HttpError(400, 'document_not_allowed'); return; }
  if (!b.id_front_image) throw new HttpError(400, 'document_required');
  if (TWO_SIDED.includes(b.id_type) ? !b.id_back_image : !!b.id_back_image) throw new HttpError(400, TWO_SIDED.includes(b.id_type) ? 'document_required' : 'document_not_allowed');
}

export const customerView = (c: Record<string, any> | null) => c ? { registered: !!c.customerId, creating: c.status === 'creating', kycStatus: c.kycStatus ?? 'unsubmitted', failureReason: c.failureReason ?? null, verificationUrl: c.verificationUrl ?? null, firstName: c.firstName ?? null, lastName: c.lastName ?? null, idLast4: c.idLast4 ?? null } : null;

// Création : on réserve d'abord l'entrée locale (create échoue si elle existe : pas de doublon sur double clic), puis on appelle l'API.
export async function createCustomer(uid: string, input: z.infer<typeof CUSTOMER_FIELDS>) {
  checkDocs(input);
  const ref = custRef(uid);
  try { await ref.create({ merchantId: uid, status: 'creating', kycStatus: 'unsubmitted', email: input.email, firstName: input.first_name, lastName: input.last_name, idLast4: input.id_number.slice(-4), createdAt: Date.now(), updatedAt: Date.now() }); }
  catch { throw new HttpError(409, 'scarab_customer_exists'); }
  const body: Record<string, unknown> = { customer_type: 'individual', ...input };
  for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];
  try {
    const r = await sp('POST', '/customers', { body });
    const d = r.data ?? {};
    await db.doc(`scarab_customer_ids/${d.id}`).set({ uid, createdAt: Date.now() });
    await ref.update({ customerId: d.id, status: 'ready', kycStatus: d.kyc_status ?? 'unsubmitted', failureReason: d.kyc_failure_reason ?? null, verificationUrl: d.verification_url ?? null, verificationUrlExpiresAt: d.verification_url_expires_at ?? null, updatedAt: Date.now() });
    info('scarab.customer_created', { merchantId: uid, customerId: d.id });
    return customerView(await getCustomer(uid));
  } catch (e) {
    if (e instanceof SpUnknown) { warn('scarab.customer_create_unknown', { merchantId: uid }); throw e; }   // l'entrée reste « creating » : recoverCustomer() la retrouvera
    await ref.delete().catch(() => {});                                                                       // refus net : l'utilisateur peut corriger et recommencer
    if (e instanceof SpError) { const h: any = new HttpError(e.status === 429 ? 429 : 400, e.code === 'validation_error' ? 'validation_error' : 'scarab_unavailable'); h.fields = e.fields; throw h; }
    throw e;
  }
}

// Création sans réponse (timeout) : on cherche le dossier parmi les derniers clients (même e-mail) avant de laisser l'utilisateur recommencer.
async function recoverCustomer(uid: string, c: Record<string, any>) {
  const list = (await spx('GET', '/customers', { query: { per_page: 100 } })).data as any[] ?? [];
  const f = list.find(x => String(x.email).toLowerCase() === String(c.email).toLowerCase() && x.first_name === c.firstName && x.last_name === c.lastName);
  if (f) { await db.doc(`scarab_customer_ids/${f.id}`).set({ uid, createdAt: Date.now() }); await custRef(uid).update({ customerId: f.id, status: 'ready', updatedAt: Date.now() }); return true; }
  if (Date.now() - (c.createdAt ?? 0) > 10 * 60_000) { await custRef(uid).delete().catch(() => {}); }   // jamais créé chez eux : on libère la place
  return false;
}

// Relit le dossier à la source (le verdict n'est jamais déduit) et met à jour la copie locale.
export async function refreshCustomer(uid: string) {
  let c = await getCustomer(uid); if (!c) return null;
  if (c.status === 'creating' && !c.customerId) { if (Date.now() - (c.updatedAt ?? 0) < 20_000 || !(await recoverCustomer(uid, c).catch(() => false))) return customerView(await getCustomer(uid)); c = await getCustomer(uid); if (!c) return null; }
  const d = (await spx('GET', `/customers/${c.customerId}`)).data ?? {};
  const patch = { kycStatus: d.kyc_status ?? c.kycStatus, failureReason: d.kyc_failure_reason ?? null, verificationUrl: d.verification_url ?? null, verificationUrlExpiresAt: d.verification_url_expires_at ?? null, updatedAt: Date.now() };
  await custRef(uid).update(patch); return customerView({ ...c, ...patch });
}
export async function requireApprovedCustomer(uid: string) {
  const c = await getCustomer(uid); if (!c?.customerId) throw new HttpError(409, 'customer_required');
  const v = await refreshCustomer(uid); if (v?.kycStatus !== 'approved') throw new HttpError(409, 'kyc_not_approved'); return c;
}
// Après un refus : l'utilisateur corrige (PATCH) puis on relance la vérification (POST /kyc). Modifier un dossier approuvé l'annule : on ne l'autorise pas.
export async function resubmitCustomer(uid: string, patch: Record<string, unknown>) {
  const c = await getCustomer(uid); if (!c?.customerId) throw new HttpError(409, 'customer_required');
  if (c.kycStatus === 'approved' || c.kycStatus === 'review' || c.kycStatus === 'pending') throw new HttpError(409, 'scarab_wrong_state');
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  if (Object.keys(clean).length) await spx('PATCH', `/customers/${c.customerId}`, { body: clean });
  const d = (await spx('POST', `/customers/${c.customerId}/kyc`)).data ?? {};
  const upd = { kycStatus: d.kyc_status ?? 'pending', failureReason: d.kyc_failure_reason ?? null, verificationUrl: d.verification_url ?? null, updatedAt: Date.now(), ...(clean.id_number ? { idLast4: String(clean.id_number).slice(-4) } : {}) };
  await custRef(uid).update(upd); return customerView({ ...c, ...upd });
}
export async function onKycEvent(customerId: string, type: string, reason?: string) {
  const m = (await db.doc(`scarab_customer_ids/${customerId}`).get()).data(); if (!m) { warn('scarab.webhook_unknown_customer'); return; }
  await refreshCustomer(m.uid).catch(() => {});
  if (type === 'customer.kyc.approved') await notify(m.uid, 'Identité vérifiée', 'Vous pouvez maintenant créer votre Carte Pro.');
  if (type === 'customer.kyc.rejected') await notify(m.uid, 'Vérification d’identité refusée', reason ? `Motif : ${reason}. Corrigez vos informations puis relancez la vérification.` : 'Corrigez vos informations puis relancez la vérification.');
}
