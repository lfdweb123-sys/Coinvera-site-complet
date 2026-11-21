import crypto from 'node:crypto';
import { db } from '@/lib/firebase-admin';
import { warn } from '@/lib/log';
import { handleEvent, verifySignature } from '@/lib/cards/webhook';
// Webhook dédié aux cartes (distinct de tout autre webhook de la plateforme). À enregistrer chez CryptoInfra : POST /v1/developer/webhooks.
export async function POST(req: Request) {
  const raw = await req.text(); const secret = process.env.CARDS_WEBHOOK_SECRET;
  if (!secret) { warn('cards.webhook_no_secret'); return new Response('not configured', { status: 503 }); }
  if (!verifySignature(raw, req.headers.get('x-cryptoinfra-signature') ?? '', secret)) { warn('cards.webhook_bad_signature'); return new Response('invalid signature', { status: 401 }); }
  const event = req.headers.get('x-cryptoinfra-event') ?? ''; let payload: any;
  try { payload = JSON.parse(raw); } catch { return new Response('bad json', { status: 400 }); }
  const key = crypto.createHash('sha256').update(event + '\n' + raw).digest('hex');
  try { await db.doc(`card_events/${key}`).create({ event, createdAt: Date.now() }); } catch { return new Response('ok'); }   // livraison déjà traitée (au moins une fois)
  try { await handleEvent(event, payload); } catch (e) { warn('cards.webhook_failed', { event, message: (e as Error).message }); await db.doc(`card_events/${key}`).delete().catch(() => {}); return new Response('retry', { status: 500 }); }
  return new Response('ok');
}
