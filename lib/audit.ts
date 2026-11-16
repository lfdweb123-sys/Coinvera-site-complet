import { db } from './firebase-admin';
export const audit = (adminUid: string, action: string, details: object = {}) =>
  db.collection('audit_logs').add({ adminUid, action, details, createdAt: new Date() });
export const notify = (merchantId: string, title: string, body = '') =>
  db.collection('notifications').add({ merchantId, title, body, read: false, createdAt: new Date() });
