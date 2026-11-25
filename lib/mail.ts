import { esc } from './brevo';
import { SITE } from './site';
// E-mails transactionnels Coinvera : un seul gabarit pour tous (codes, notifications, reçus, support, alertes).
// Mise en page en tableaux et styles EN LIGNE (compatible Gmail, Outlook, mode sombre automatique), une seule colonne fluide de 560 px max, aucune image externe ni script.
// Tout texte venant de données (nom, message, titre) est échappé ici : jamais de HTML brut en entrée.
const T = (s: string) => esc(s).replace(/\r?\n/g, '<br>');
const C = { navy: '#0A1535', ink: '#111827', mut: '#5b6477', line: '#e3e8f2', soft: '#f6f8fc', ok: '#12b76a' };
const FONT = "font-family:-apple-system,'Segoe UI',Roboto,Arial,Helvetica,sans-serif;";
const DOCS = 'https://docs.coinvera.me';
export type MailRow = [label: string, value: string];
export function simpleEmail(p: { title: string; name?: string; highlight?: string; paragraphs?: string[]; rows?: MailRow[]; code?: string; link?: { href: string; label: string }; note?: string }) {
  const support = process.env.SUPPORT_EMAIL ? `<a href="mailto:${esc(process.env.SUPPORT_EMAIL)}" style="color:${C.navy};font-weight:600;">${esc(process.env.SUPPORT_EMAIL)}</a> ou ` : '';
  // Titre : la partie « highlight » (montant, état…) est mise en valeur en vert.
  let title = esc(p.title); const hl = p.highlight ? esc(p.highlight) : '';
  if (hl && title.includes(hl)) title = title.replace(hl, `<span style="color:${C.ok};">${hl}</span>`);
  const greet = `<p style="margin:0 0 14px;font-size:16px;color:${C.ink};">Bonjour${p.name ? ' ' + esc(p.name) : ''},</p>`;
  const paras = (p.paragraphs ?? []).map((x, i) => `<p style="margin:0 0 14px;font-size:${i === 0 ? 16 : 15}px;line-height:1.55;color:${i === 0 ? C.mut : C.ink};">${T(x)}</p>`).join('');
  const code = p.code ? `<div style="margin:6px 0 18px;padding:16px;text-align:center;background:${C.soft};border:1px solid ${C.line};border-radius:12px;font-size:34px;letter-spacing:8px;font-weight:700;color:${C.navy};">${esc(p.code)}</div>` : '';
  const rows = p.rows?.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 20px;background:${C.soft};border:1px solid ${C.line};border-radius:12px;border-collapse:separate;">${p.rows.map(([k, v], i) =>
    `<tr><td valign="top" style="padding:12px 16px;${i ? `border-top:1px solid ${C.line};` : ''}font-size:14px;color:${C.mut};width:42%;">${T(k)}</td><td valign="top" align="right" style="padding:12px 16px;${i ? `border-top:1px solid ${C.line};` : ''}font-size:14px;font-weight:600;color:${C.ink};word-break:break-word;">${T(v)}</td></tr>`).join('')}</table>` : '';
  const btn = p.link ? `<p style="margin:4px 0 22px;"><a href="${esc(p.link.href)}" style="display:inline-block;background:${C.navy};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 24px;border-radius:10px;">${esc(p.link.label)}</a></p>` : '';
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${esc(p.title)}</title></head>
<body style="margin:0;padding:0;background:#eef1f7;${FONT}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f7;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${C.line};border-radius:16px;overflow:hidden;border-collapse:separate;">
<tr><td style="background:${C.navy};padding:22px 28px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="width:34px;height:34px;background:#2f6bff;border-radius:9px;text-align:center;color:#ffffff;font-size:19px;font-weight:800;${FONT}">C</td><td style="padding-left:12px;color:#ffffff;font-size:21px;font-weight:700;letter-spacing:.2px;${FONT}">Coinvera</td></tr></table></td></tr>
<tr><td style="padding:30px 28px 8px;${FONT}">
${greet}<h1 style="margin:0 0 16px;font-size:25px;line-height:1.25;color:${C.ink};">${title}</h1>
${paras}${code}${rows}${btn}
</td></tr>
<tr><td style="padding:0 28px 26px;${FONT}font-size:13.5px;line-height:1.6;color:${C.mut};">
<p style="margin:0 0 10px;">Une question ? Notre équipe vous répond : ${support}<a href="${SITE}/contact" style="color:${C.navy};font-weight:600;">formulaire de contact</a>.</p>
${(p.note ?? (p.code ? 'Ne communiquez jamais ce code : l’équipe Coinvera ne vous le demandera jamais.' : '')) ? `<p style="margin:0 0 10px;">${T(p.note ?? 'Ne communiquez jamais ce code : l’équipe Coinvera ne vous le demandera jamais.')}</p>` : ''}
<p style="margin:0;color:${C.ink};"><b>L’équipe Coinvera</b></p></td></tr>
<tr><td style="background:${C.navy};padding:18px 28px;${FONT}font-size:12.5px;line-height:1.7;color:#aab4cf;">
<a href="${SITE}" style="color:#ffffff;text-decoration:none;font-weight:700;">www.coinvera.me</a> &nbsp;·&nbsp; <a href="${DOCS}" style="color:#aab4cf;">Documentation</a> &nbsp;·&nbsp; <a href="${SITE}/terms" style="color:#aab4cf;">Conditions</a> &nbsp;·&nbsp; <a href="${SITE}/privacy" style="color:#aab4cf;">Confidentialité</a><br>
© ${new Date().getUTCFullYear()} Coinvera LLC. Tous droits réservés.</td></tr>
</table></td></tr></table></body></html>`;
}
export function codeEmail(p: { name: string; code: string; purpose: 'verify' | 'reset' }) {
  const verify = p.purpose === 'verify';
  return { subject: `${p.code} est votre code Coinvera`, html: simpleEmail({ title: verify ? 'Vérifiez votre adresse e-mail' : 'Réinitialisez votre mot de passe', name: p.name || undefined, code: p.code,
    paragraphs: [verify ? 'Voici votre code pour confirmer votre adresse e-mail.' : 'Voici votre code pour réinitialiser votre mot de passe.', 'Ce code est valable 10 minutes. Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.'] }) };
}
// Notification du tableau de bord envoyée aussi par e-mail.
export function notificationEmail(p: { title: string; body: string; name?: string }) {
  return { subject: p.title.slice(0, 150), html: simpleEmail({ title: p.title, name: p.name, paragraphs: [p.body || 'Consultez votre tableau de bord pour le détail.'], link: { href: `${SITE}/dashboard`, label: 'Ouvrir mon tableau de bord' }, note: 'Cet e-mail reprend une notification de votre tableau de bord Coinvera.' }) };
}
