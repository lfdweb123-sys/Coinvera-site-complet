import crypto from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, db } from '@/lib/firebase-admin';
import { ipOf, rateLimit } from '@/lib/ratelimit';
import { info, warn, error } from '@/lib/log';
// SCRIPT TEMPORAIRE : cree le premier administrateur. Protege par SETUP_TOKEN, utilisable une seule fois, a supprimer ensuite.
const page = (t: string, m: string, s = 200) => new Response(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${t}</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#F5F8FC;font-family:Inter,Arial,sans-serif;color:#0B1220;padding:16px"><div style="max-width:520px;width:100%;background:#fff;border:1px solid #E5EAF2;border-radius:16px;padding:32px"><div style="font-weight:800;font-size:22px;margin-bottom:14px">Coinvera</div><h1 style="font-size:22px;margin:0 0 10px">${t}</h1><p style="color:#475569;line-height:1.6;margin:0">${m}</p></div></body></html>`, { status: s, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
export async function GET(req: Request) {
  try { await rateLimit('setup_' + ipOf(req), 10, 3600); } catch { return page('Trop de tentatives', 'Réessayez plus tard.', 429); }
  const { SETUP_TOKEN, SETUP_ADMIN_EMAIL, SETUP_ADMIN_PASSWORD } = process.env;
  if (!SETUP_TOKEN || !SETUP_ADMIN_EMAIL || !SETUP_ADMIN_PASSWORD) return page('Non configuré', 'Les variables SETUP_TOKEN, SETUP_ADMIN_EMAIL et SETUP_ADMIN_PASSWORD ne sont pas définies.', 404);
  const given = new URL(req.url).searchParams.get('token') ?? ''; const a = Buffer.from(given), b = Buffer.from(SETUP_TOKEN);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) { warn('setup.bad_token', { ip: ipOf(req) }); return page('Accès refusé', 'Jeton invalide.', 403); }
  const flag = db.doc('system/setup');
  if ((await flag.get()).exists) { warn('setup.already_done', {}); return page('Déjà effectué', 'Le premier administrateur a déjà été créé. Supprimez le script et les variables SETUP_*.', 410); }
  try {
    let uid: string; try { const u = await adminAuth.getUserByEmail(SETUP_ADMIN_EMAIL); uid = u.uid; await adminAuth.updateUser(uid, { password: SETUP_ADMIN_PASSWORD, emailVerified: true, disabled: false }); }
    catch { uid = (await adminAuth.createUser({ email: SETUP_ADMIN_EMAIL, password: SETUP_ADMIN_PASSWORD, emailVerified: true, displayName: 'Administrateur' })).uid; }
    await adminAuth.setCustomUserClaims(uid, { role: 'admin' });
    const now = FieldValue.serverTimestamp(); const batch = db.batch();
    batch.set(db.doc(`merchants/${uid}`), { email: SETUP_ADMIN_EMAIL, fullName: 'Administrateur', company: 'COINVERA', merchantCode: 'ADMIN-' + crypto.randomBytes(3).toString('hex').toUpperCase(), status: 'active', emailVerified: true, createdAt: now, updatedAt: now }, { merge: true });
    batch.set(db.doc(`merchant_settings/${uid}`), { webhookUrl: null, webhookSecret: 'whsec_' + crypto.randomBytes(24).toString('hex'), createdAt: now }, { merge: true });
    batch.set(db.doc(`api_activations/${uid}`), { activated: false, trialsUsed: 0, createdAt: now }, { merge: true });
    batch.set(db.doc(`balances/${uid}`), { available: 0, reserved: 0, totalReceived: 0, totalWithdrawn: 0, feesPaid: 0, updatedAt: now }, { merge: true });
    batch.set(flag, { done: true, uid, at: Date.now() });
    await batch.commit(); info('setup.admin_created', { uid, email: SETUP_ADMIN_EMAIL });
    return page('Administrateur créé', `Le compte ${SETUP_ADMIN_EMAIL} est maintenant administrateur. Connectez-vous sur /login : vous serez redirigé vers /admin. Supprimez ensuite les variables SETUP_* dans Vercel.`);
  } catch (e) { error('setup.failed', { message: (e as Error).message }); return page('Échec', 'La création a échoué. Consultez les journaux Vercel.', 500); }
}
