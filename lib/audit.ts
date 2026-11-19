import { adminAuth, db } from './firebase-admin';
import { info } from './log';
export const audit = async (adminUid: string, action: string, details: object = {}) => {
  let adminEmail = ''; try { adminEmail = (await adminAuth.getUser(adminUid)).email ?? ''; } catch {}
  info('admin.' + action, { adminUid, adminEmail, ...details });
  return db.collection('audit_logs').add({ adminUid, adminEmail, action, details, createdAt: new Date() });
};
export const notify = (merchantId: string, title: string, body = '') =>
  db.collection('notifications').add({ merchantId, title, body, read: false, createdAt: new Date() });
