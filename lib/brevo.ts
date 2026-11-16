export const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export async function sendMail(to: string, subject: string, html: string) {
  const r = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', signal: AbortSignal.timeout(10_000),
    headers: { 'api-key': process.env.BREVO_API_KEY!, 'content-type': 'application/json' },
    body: JSON.stringify({ sender: { email: process.env.SUPPORT_EMAIL, name: 'Coinvera' }, to: [{ email: to }], subject, htmlContent: html }) });
  if (!r.ok) throw new Error('brevo_' + r.status);
}
