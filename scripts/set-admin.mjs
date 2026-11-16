// Usage : node scripts/set-admin.mjs <uid>   (le role admin n'est jamais attribuable depuis le navigateur)
import { initializeApp, cert } from 'firebase-admin/app'; import { getAuth } from 'firebase-admin/auth';
initializeApp({ credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') }) });
await getAuth().setCustomUserClaims(process.argv[2], { role: 'admin' }); console.log('admin ok');
