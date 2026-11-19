import { getApps, initializeApp, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';
type Env = Record<string, string | undefined>;
// Accepte soit FIREBASE_SERVICE_ACCOUNT (contenu JSON complet ou base64 du fichier), soit les 3 variables separees.
// Tolere les guillemets autour de la cle et les "\n" echappes.
export function loadCreds(env: Env) {
  const raw = (env.FIREBASE_SERVICE_ACCOUNT ?? '').trim();
  if (raw) {
    try { const j = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')); return { projectId: j.project_id as string, clientEmail: j.client_email as string, privateKey: String(j.private_key).replace(/\\n/g, '\n') }; }
    catch { throw new Error('FIREBASE_SERVICE_ACCOUNT illisible : collez le contenu JSON complet du fichier ou son encodage base64.'); }
  }
  const key = (env.FIREBASE_PRIVATE_KEY ?? '').trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
  const miss = [!env.FIREBASE_PROJECT_ID && 'FIREBASE_PROJECT_ID', !env.FIREBASE_CLIENT_EMAIL && 'FIREBASE_CLIENT_EMAIL', !key.includes('BEGIN PRIVATE KEY') && 'FIREBASE_PRIVATE_KEY'].filter(Boolean);
  if (miss.length) throw new Error(`Configuration Firebase incomplete ou invalide (${miss.join(', ')}). Verifiez les variables d'environnement Vercel de l'environnement Production, puis redeployez.`);
  return { projectId: env.FIREBASE_PROJECT_ID!, clientEmail: env.FIREBASE_CLIENT_EMAIL!, privateKey: key };
}
let _app: App | undefined;
const app = () => (_app ??= getApps()[0] ?? initializeApp({ credential: cert(loadCreds(process.env)) }));
// Initialisation paresseuse : le build ne plante pas si une variable manque, l'erreur n'apparait qu'a l'usage.
const lazy = <T extends object>(f: () => T) => new Proxy({} as T, { get: (_, p) => { const o: any = f(); const v = o[p]; return typeof v === 'function' ? v.bind(o) : v; } });
export const db = lazy<Firestore>(() => getFirestore(app()));
export const adminAuth = lazy<Auth>(() => getAuth(app()));
