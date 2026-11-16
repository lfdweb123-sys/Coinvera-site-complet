import { getApps, initializeApp, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';
let _app: App | undefined;
const app = () => (_app ??= getApps()[0] ?? initializeApp({ credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n') }) }));
// Initialisation paresseuse : le build Vercel ne plante pas si une variable manque, l'erreur n'apparait qu'a l'usage.
const lazy = <T extends object>(f: () => T) => new Proxy({} as T, { get: (_, p) => { const o: any = f(); const v = o[p]; return typeof v === 'function' ? v.bind(o) : v; } });
export const db = lazy<Firestore>(() => getFirestore(app()));
export const adminAuth = lazy<Auth>(() => getAuth(app()));
