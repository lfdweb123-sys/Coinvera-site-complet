import { warn } from './log';
const NEEDED: [string, string[]][] = [['Firebase', ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']], ['Chiffrement', ['API_SECRET_ENC_KEY']], ['E-mails (code de verification)', ['BREVO_API_KEY', 'SUPPORT_EMAIL']], ['Encaissement carte', ['PROCESSOR_BASE_URL', 'PROCESSOR_API_KEY', 'PROCESSOR_WEBHOOK_SECRET']], ['Retraits', ['BYBIT_API_KEY', 'BYBIT_API_SECRET', 'CRON_SECRET']]];
let done = false;
// Journalise (une fois par demarrage) les variables d'environnement manquantes, sans jamais afficher leurs valeurs.
export function checkEnv() {
  if (done) return; done = true;
  for (const [group, keys] of NEEDED) { const missing = keys.filter(k => !process.env[k] && !(k.startsWith('FIREBASE_') && process.env.FIREBASE_SERVICE_ACCOUNT)); if (missing.length) warn('config.missing_env', { group, missing }); }
}
