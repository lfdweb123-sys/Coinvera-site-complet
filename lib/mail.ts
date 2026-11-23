import { esc } from './brevo';
import { SITE } from './site';
// E-mails : volontairement SIMPLES. Une seule colonne fluide (max 480 px, s'adapte à tout écran), police système, très peu de style en ligne, pas de tableaux ni d'images.
// Tout texte venant de données (nom, message, titre) est échappé ici : jamais de HTML brut en entrée.
const T = (s: string) => esc(s).replace(/\r?\n/g, '<br>');
export function simpleEmail(p: { title: string; paragraphs?: string[]; code?: string; link?: { href: string; label: string }; note?: string }) {
  const body = [
    ...(p.paragraphs ?? []).map(x => `<p>${T(x)}</p>`),
    p.code ? `<p style="font-size:32px;letter-spacing:6px;font-weight:bold;margin:20px 0;">${esc(p.code)}</p>` : '',
    p.link ? `<p><a href="${esc(p.link.href)}">${esc(p.link.label)}</a></p>` : '',
  ].join('\n');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.title)}</title></head>
<body style="margin:0;padding:16px;"><div style="max-width:480px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#111;">
<p><b>Coinvera</b></p>
<h2 style="font-size:20px;margin:16px 0 8px;">${esc(p.title)}</h2>
${body}
<hr style="border:0;border-top:1px solid #ddd;margin:24px 0 12px;">
<p style="font-size:12px;color:#666;">${T(p.note ?? 'Coinvera LLC — ne communiquez jamais vos codes : notre équipe ne vous les demandera jamais.')}<br><a href="${SITE}">www.coinvera.me</a></p>
</div></body></html>`;
}
export function codeEmail(p: { name: string; code: string; purpose: 'verify' | 'reset' }) {
  const verify = p.purpose === 'verify';
  return { subject: `${p.code} est votre code Coinvera`, html: simpleEmail({ title: verify ? 'Vérifiez votre adresse e-mail' : 'Réinitialisez votre mot de passe', paragraphs: [`Bonjour ${p.name || ''},`, verify ? 'Voici votre code pour confirmer votre adresse e-mail :' : 'Voici votre code pour réinitialiser votre mot de passe :'], code: p.code })
    .replace('</h2>', '</h2>').replace(/<hr/, `<p>Ce code est valable 10 minutes. Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.</p>\n<hr`) };
}
// Notification du tableau de bord envoyée aussi par e-mail.
export function notificationEmail(p: { title: string; body: string }) {
  return { subject: p.title.slice(0, 150), html: simpleEmail({ title: p.title, paragraphs: [p.body || 'Consultez votre tableau de bord pour le détail.'], link: { href: `${SITE}/dashboard`, label: 'Ouvrir mon tableau de bord' }, note: 'Cet e-mail reprend une notification de votre tableau de bord Coinvera.' }) };
}
