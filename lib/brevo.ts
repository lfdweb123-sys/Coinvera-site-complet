export const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export type MailAttachment = { name: string; content: Buffer };
// `attachments` : joints envoyés tels quels (base64 dans la requête) ; rien n'est écrit sur disque.
export async function sendMail(to: string, subject: string, html: string, attachments?: MailAttachment[]) {
  const r = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', signal: AbortSignal.timeout(attachments?.length ? 20_000 : 10_000),
    headers: { 'api-key': process.env.BREVO_API_KEY!, 'content-type': 'application/json' },
    body: JSON.stringify({ sender: { email: process.env.SUPPORT_EMAIL, name: 'Coinvera' }, to: [{ email: to }], subject, htmlContent: html, ...(attachments?.length ? { attachment: attachments.map(a => ({ name: a.name, content: a.content.toString('base64') })) } : {}) }) });
  if (!r.ok) throw new Error('brevo_' + r.status);
}
