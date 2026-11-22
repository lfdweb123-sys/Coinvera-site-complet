import { db } from '@/lib/firebase-admin';
import { warn } from '@/lib/log';
import { handleEvent, verifyWebhook } from '@/lib/scarab/webhook';
// Webhook dédié à la Virtuals cards pro (distinct de tout autre webhook de la plateforme). À enregistrer dans le portail ScarabPay (/portal/webhooks) :
// URL https://www.coinvera.me/api/webhooks/scarab ; le secret de signature (affiché une seule fois) va dans SCARABPAY_WEBHOOK_SECRET.
// Ordre : corps brut -> signature -> déduplication (X-ScarabPay-Delivery) -> traitement -> 200. Le code de vérification (card.activation_code) n'est jamais relivré : pas de relecture possible.
export async function POST(req: Request) {
  const raw = await req.text(); const secret = process.env.SCARABPAY_WEBHOOK_SECRET;
  if (!secret) { warn('scarab.webhook_no_secret'); return new Response('not configured', { status: 503 }); }
  if (!verifyWebhook(raw, req.headers.get('x-scarabpay-signature') ?? '', secret)) { warn('scarab.webhook_bad_signature'); return new Response('invalid signature', { status: 401 }); }
  let body: any; try { body = JSON.parse(raw); } catch { return new Response('bad json', { status: 400 }); }
  const type = String(body?.type ?? req.headers.get('x-scarabpay-event') ?? ''); const delivery = (req.headers.get('x-scarabpay-delivery') ?? '').replace(/[^0-9A-Za-z]/g, '');
  const ref = delivery ? db.doc(`scarab_events/${delivery}`) : null;
  if (ref) { try { await ref.create({ type, createdAt: Date.now() }); } catch { return new Response('ok'); } }   // livraison déjà traitée (les nouvelles tentatives gardent le même identifiant)
  try { await handleEvent(type, body?.data ?? {}); }
  catch (e) { warn('scarab.webhook_failed', { type, message: (e as Error).message }); if (ref) await ref.delete().catch(() => {}); return new Response('retry', { status: 500 }); }
  return new Response('ok');
}
