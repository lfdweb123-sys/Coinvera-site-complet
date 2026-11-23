import crypto from 'node:crypto';
import { billDeliveredMessage } from '@/lib/whatsapp-billing';
import { warn } from '@/lib/log';

/** Validation du webhook au moment de l'abonnement dans Meta Business Manager. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get('hub.mode') === 'subscribe' && u.searchParams.get('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN && process.env.WHATSAPP_VERIFY_TOKEN)
    return new Response(u.searchParams.get('hub.challenge') ?? '', { status: 200 });
  return new Response('forbidden', { status: 403 });
}

/** Statuts de livraison envoyés par Meta (sent/delivered/read/failed) : seul 'delivered' déclenche une facturation,
 *  exactement l'évènement que Meta facture à Coinvera. */
export async function POST(req: Request) {
  const raw = await req.text();
  const sig = (req.headers.get('x-hub-signature-256') ?? '').replace('sha256=', '');
  const exp = crypto.createHmac('sha256', process.env.WHATSAPP_APP_SECRET ?? '').update(raw).digest('hex');
  const a = Buffer.from(exp), b = Buffer.from(sig);
  if (!process.env.WHATSAPP_APP_SECRET || a.length !== b.length || !crypto.timingSafeEqual(a, b)) { warn('whatsapp_webhook.invalid_signature', {}); return new Response('invalid signature', { status: 400 }); }
  let ev: any; try { ev = JSON.parse(raw); } catch { return new Response('ok'); }
  for (const entry of ev.entry ?? []) for (const change of entry.changes ?? []) for (const st of change.value?.statuses ?? []) {
    try { if (st?.id && st?.status) await billDeliveredMessage(String(st.id), String(st.status)); }
    catch (e) { warn('whatsapp_webhook.bill_failed', { id: st?.id, error: String(e) }); }
  }
  return new Response('OK');
}
