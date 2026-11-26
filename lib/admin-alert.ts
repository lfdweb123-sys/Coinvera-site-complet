import { sendMail } from './brevo';
import { simpleEmail } from './mail';
import { ALERT_TO } from './cards/refill';
import { warn } from './log';
// E-mail d'information à l'administrateur (SUPPORT_EMAIL + REFILL_ALERT_EMAILS). Ne lève jamais d'erreur : un échec d'e-mail ne bloque aucune opération.
export async function alertAdmins(subject: string, paragraphs: string[], rows?: [string, string][]) {
  try {
    if (!process.env.BREVO_API_KEY) { warn('admin_alert.not_sent', { subject }); return; }
    const html = simpleEmail({ title: subject, paragraphs, rows, note: 'Alerte automatique Coinvera.' });
    for (const to of ALERT_TO()) await sendMail(to, subject, html).catch(e => warn('admin_alert.failed', { message: (e as Error).message }));
  } catch (e) { warn('admin_alert.error', { message: (e as Error).message }); }
}
