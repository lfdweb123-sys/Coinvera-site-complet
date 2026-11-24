import { adminAuth, db } from './firebase-admin';
import { info, warn } from './log';
import { sendMail } from './brevo';
import { notificationEmail } from './mail';
export const audit = async (adminUid: string, action: string, details: object = {}) => {
  let adminEmail = ''; try { adminEmail = (await adminAuth.getUser(adminUid)).email ?? ''; } catch {}
  info('admin.' + action, { adminUid, adminEmail, ...details });
  return db.collection('audit_logs').add({ adminUid, adminEmail, action, details, createdAt: new Date() });
};
// Chaque notification est enregistrée dans le tableau de bord ET envoyée par e-mail à l'utilisateur. L'échec de l'e-mail ne bloque jamais l'opération.
export async function merchantEmail(merchantId: string) {
  const m = (await db.doc(`merchants/${merchantId}`).get()).data(); let to = typeof m?.email === 'string' ? m.email : '';
  if (!to) { try { to = (await adminAuth.getUser(merchantId)).email ?? ''; } catch { /* compte introuvable */ } }
  return to;
}
async function emailTo(merchantId: string, title: string, body: string) {
  const to = await merchantEmail(merchantId);
  if (!to || !process.env.BREVO_API_KEY || !process.env.SUPPORT_EMAIL) return;
  const e = notificationEmail({ title, body }); await sendMail(to, e.subject, e.html);
}
export const notify = async (merchantId: string, title: string, body = '') => {
  const ref = await db.collection('notifications').add({ merchantId, title, body, read: false, createdAt: new Date() });
  await emailTo(merchantId, title, body).catch(e => warn('notify.email_failed', { merchantId, message: (e as Error).message }));
  return ref;
};
