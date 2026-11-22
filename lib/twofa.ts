import { db } from './firebase-admin';
// Où vivent le profil et le secret 2FA : un administrateur n'est pas un marchand (admins/{uid} + admin_settings/{uid}), les deux mondes restent séparés.
export const twofaRefs = (u: { uid: string; role: string }) => u.role === 'admin'
  ? { prof: db.doc(`admins/${u.uid}`), secret: db.doc(`admin_settings/${u.uid}`) }
  : { prof: db.doc(`merchants/${u.uid}`), secret: db.doc(`merchant_settings/${u.uid}`) };
