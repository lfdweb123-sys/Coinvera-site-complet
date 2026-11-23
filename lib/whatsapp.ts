import { warn, info } from './log';

/** Un seul compte WhatsApp Business (Meta Cloud API), partagé par tous les marchands — comme l'encaissement carte :
 *  aucun marchand n'a de compte WhatsApp à créer ou de jeton à configurer. */
const BASE = () => `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

export class WhatsAppError extends Error { constructor(public code: string, message: string) { super(message); } }

/** Indicatifs téléphoniques des marchés desservis. À compléter si Coinvera s'étend ailleurs. */
const DIAL: Record<string, string> = { BJ: '229', CI: '225', SN: '221', TG: '228', ML: '223', BF: '226', NE: '227', GN: '224', TD: '235', CG: '242', CD: '243', CM: '237', GA: '241', FR: '33', BE: '32', CH: '41', LU: '352', CA: '1', US: '1', GB: '44' };

/** WooCommerce fournit un numéro saisi librement (espaces, 0 initial, +, 00...) ; on tente une mise en forme E.164
 *  (chiffres seulement, indicatif pays inclus, sans le +) à partir du pays de facturation. Retourne null si le résultat
 *  ne peut pas être mis en forme avec confiance (mieux vaut ne pas envoyer que d'envoyer à un faux numéro). */
export function toE164Digits(rawPhone: string, billingCountry: string): string | null {
  let d = (rawPhone || '').replace(/\D/g, ''); if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  const dial = DIAL[(billingCountry || '').toUpperCase()];
  if (dial && d.startsWith(dial)) return d.length >= 8 ? d : null;
  if (dial) { d = d.replace(/^0+/, ''); const full = dial + d; return full.length >= 8 && full.length <= 15 ? full : null; }
  return d.length >= 8 && d.length <= 15 ? d : null;   // indicatif déjà présent mais pays non reconnu : on tente tel quel
}

/** Envoie un message modèle (obligatoire pour toute communication initiée par l'entreprise hors fenêtre de 24 h).
 *  `params` remplit {{1}}, {{2}}... du corps du modèle, dans l'ordre. */
export async function sendWhatsAppTemplate(toDigits: string, template: string, lang: string, params: string[]) {
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) throw new WhatsAppError('not_configured', 'WhatsApp non configuré côté serveur.');
  const r = await fetch(BASE(), {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: toDigits, type: 'template', template: { name: template, language: { code: lang },
      components: params.length ? [{ type: 'body', parameters: params.map(p => ({ type: 'text', text: p.slice(0, 1024) })) }] : [] } }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { warn('whatsapp.send_failed', { status: r.status, error: d?.error?.message, template }); throw new WhatsAppError('send_failed', d?.error?.message ?? `HTTP ${r.status}`); }
  info('whatsapp.sent', { template, messageId: d?.messages?.[0]?.id });
  return { id: d?.messages?.[0]?.id as string | undefined };
}
