import { esc } from './brevo';
import { SITE } from './site';
// E-mails transactionnels : mise en page en tableaux, styles en ligne uniquement (compatibles avec tous les clients mail), largeur fluide.
const F = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
function shell(preheader: string, title: string, inner: string) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#F3F6FB;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">${esc(preheader)}&#8199;&zwnj;&#8199;&zwnj;&#8199;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F3F6FB;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#FFFFFF;border:1px solid #E5EAF2;border-radius:16px;">
<tr><td style="background:#0A1535;border-radius:16px 16px 0 0;padding:26px 32px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#2255E8;border-radius:10px;width:36px;height:36px;text-align:center;font-family:${F};font-size:20px;font-weight:700;color:#FFFFFF;line-height:36px;">C</td><td style="padding-left:12px;font-family:${F};font-size:22px;font-weight:700;color:#FFFFFF;letter-spacing:-0.5px;">Coinvera</td></tr></table></td></tr>
<tr><td style="padding:36px 32px 12px 32px;font-family:${F};color:#0B1220;">${inner}</td></tr>
<tr><td style="padding:8px 32px 30px 32px;font-family:${F};font-size:12px;line-height:18px;color:#64748B;border-top:1px solid #E5EAF2;">
<p style="margin:18px 0 6px 0;">Cet e-mail vous a été envoyé par COINVERA car une action a été demandée sur votre compte. Ne communiquez jamais ce code : notre équipe ne vous le demandera jamais.</p>
<p style="margin:0;">© ${new Date().getFullYear()} COINVERA · <a href="${SITE}" style="color:#2255E8;text-decoration:none;">www.coinvera.me</a></p></td></tr></table></td></tr></table></body></html>`;
}
export function codeEmail(p: { name: string; code: string; purpose: 'verify' | 'reset' }) {
  const verify = p.purpose === 'verify';
  const title = verify ? 'Vérifiez votre adresse e-mail' : 'Réinitialisez votre mot de passe';
  const lead = verify ? 'Merci de rejoindre Coinvera. Saisissez ce code pour confirmer votre adresse e-mail et activer votre compte.' : 'Vous avez demandé à réinitialiser votre mot de passe. Saisissez ce code pour continuer.';
  const inner = `<h1 style="margin:0 0 14px 0;font-family:${F};font-size:24px;line-height:30px;font-weight:700;color:#0B1220;">${title}</h1>
<p style="margin:0 0 8px 0;font-size:16px;line-height:24px;color:#334155;">Bonjour ${esc(p.name || '')},</p>
<p style="margin:0 0 24px 0;font-size:16px;line-height:24px;color:#334155;">${lead}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="background:#EEF3FE;border:1px solid #D7E3FD;border-radius:12px;padding:22px 8px;font-family:'SF Mono',Menlo,Consolas,'Courier New',monospace;font-size:36px;line-height:40px;font-weight:700;letter-spacing:10px;color:#2255E8;">${esc(p.code)}</td></tr></table>
<p style="margin:22px 0 8px 0;font-size:15px;line-height:22px;color:#334155;">Ce code est valable <b>10 minutes</b>.</p>
<p style="margin:0 0 20px 0;font-size:14px;line-height:21px;color:#64748B;">Si vous n’êtes pas à l’origine de cette demande, ignorez simplement cet e-mail : votre compte reste protégé.</p>`;
  return { subject: `${p.code} est votre code Coinvera`, html: shell(`Votre code de vérification : ${p.code}`, title, inner) };
}
