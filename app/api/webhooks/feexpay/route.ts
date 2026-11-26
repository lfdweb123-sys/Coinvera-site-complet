import { db } from '@/lib/firebase-admin';
import { warn } from '@/lib/log';
import { onWebhook } from '@/lib/fiat/orders';
import { verifyFeexWebhook } from '@/lib/fiat/webhook';
import { ipOf, rateLimit } from '@/lib/ratelimit';
// Webhook FeexPay (dépôts mobile money / virement pour les cartes). À renseigner dans le menu Webhook de FeexPay : https://www.coinvera.me/api/webhooks/feexpay
// avec le mode « Signature HMAC » ; le secret (fxp_whsec_…, affiché une seule fois) va dans FEEXPAY_WEBHOOK_SECRET.
// Ordre : corps brut -> signature + horodatage (401 sinon, définitif chez FeexPay) -> déduplication (x-feexpay-delivery-id) -> traitement -> 200.
// Le contenu n'est JAMAIS cru : il ne sert que de signal (référence). Le statut est relu chez FeexPay avant tout crédit. Sans secret configuré, le message reste un simple signal (rien ne peut être crédité par un faux message).
export async function POST(req: Request) {
  try { await rateLimit('fxwh_' + ipOf(req), 300, 60); } catch { return new Response('slow down', { status: 429 }); }
  const raw = await req.text(); const secret = process.env.FEEXPAY_WEBHOOK_SECRET; const delivery = (req.headers.get('x-feexpay-delivery-id') ?? '').replace(/[^0-9A-Za-z-]/g, '').slice(0, 64);
  if (secret) { if (!verifyFeexWebhook(raw, { timestamp: req.headers.get('x-feexpay-timestamp'), deliveryId: req.headers.get('x-feexpay-delivery-id'), signature: req.headers.get('x-feexpay-signature') }, secret)) { warn('fiat.webhook_bad_signature'); return new Response('invalid signature', { status: 401 }); } }
  else warn('fiat.webhook_unsigned');
  const event = req.headers.get('x-feexpay-event') ?? ''; if (event.startsWith('payout') || event === 'payment_history') return new Response('ok');
  let b: any; try { b = JSON.parse(raw); } catch { return new Response('bad json', { status: 400 }); }
  const ref = secret && delivery ? db.doc(`fiat_events/${delivery}`) : null;
  if (ref) { try { await ref.create({ event, createdAt: Date.now() }); } catch { return new Response('ok'); } }   // envoi déjà traité (les nouvelles tentatives gardent le même identifiant)
  const reference = String(b?.reference ?? b?.order_id ?? b?.data?.reference ?? '').slice(0, 120);
  if (!reference) return new Response('ok');
  try { await onWebhook(reference); } catch (e) { warn('fiat.webhook_failed', { message: (e as Error).message }); if (ref) await ref.delete().catch(() => {}); return new Response('retry', { status: 500 }); }
  return new Response('ok');
}
