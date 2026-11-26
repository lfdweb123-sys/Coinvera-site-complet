import { warn } from '@/lib/log';
import { onWebhook } from '@/lib/fiat/orders';
import { ipOf, rateLimit } from '@/lib/ratelimit';
// Webhook FeexPay (dépôts mobile money / virement pour les cartes). À renseigner dans le menu Développeur de FeexPay : https://www.coinvera.me/api/webhooks/feexpay
// Le contenu du message n'est JAMAIS cru : il sert seulement de signal (référence). On relit alors le statut chez FeexPay avant tout crédit, donc un faux message ne peut rien créditer.
export async function POST(req: Request) {
  try { await rateLimit('fxwh_' + ipOf(req), 300, 60); } catch { return new Response('slow down', { status: 429 }); }
  let b: any; try { b = await req.json(); } catch { return new Response('bad json', { status: 400 }); }
  const reference = String(b?.reference ?? b?.data?.reference ?? b?.transaction?.reference ?? '').slice(0, 120);
  if (!reference) return new Response('ok');
  try { await onWebhook(reference); } catch (e) { warn('fiat.webhook_failed', { message: (e as Error).message }); return new Response('retry', { status: 500 }); }
  return new Response('ok');
}
