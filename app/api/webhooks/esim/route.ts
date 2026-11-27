import crypto from 'node:crypto';
import { handleEvent } from '@/lib/esim/orders';
import { esimEnabled } from '@/lib/esim/api';
import { rateLimit, ipOf } from '@/lib/ratelimit';
import { error as logError, info } from '@/lib/log';
// Webhook eSIM Access (ORDER_STATUS, ESIM_STATUS, DATA_USAGE, VALIDITY_USAGE, CHECK_HEALTH, SMDP_EVENT). eSIM Access ne signe pas ses envois : le contenu n'est JAMAIS cru, il sert uniquement de signal pour relire la commande chez eux.
// Protection : jeton optionnel dans l'adresse (?token=ESIM_WEBHOOK_TOKEN) et limite par IP. Réponse 200 pour tout événement lisible (sinon le prestataire réessaie ou désactive le webhook).
const tokenOk = (req: Request) => {
  const want = process.env.ESIM_WEBHOOK_TOKEN; if (!want) return true;
  const got = new URL(req.url).searchParams.get('token') ?? ''; const a = Buffer.from(got), b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
export async function POST(req: Request) {
  if (!tokenOk(req)) return new Response('forbidden', { status: 403 });
  let b: any; try { b = await req.json(); } catch { return Response.json({ ok: false }, { status: 400 }); }
  const type = String(b?.notifyType ?? ''); if (type === 'CHECK_HEALTH') return Response.json({ ok: true });   // test envoyé à l'enregistrement du webhook
  try {
    await rateLimit('eswh_' + ipOf(req), 600, 60);
    if (!esimEnabled()) return Response.json({ ok: true, skipped: 'esim_disabled' });
    const r = await handleEvent(type, b?.content && typeof b.content === 'object' ? b.content : {}, String(b?.notifyId ?? ''));
    info('esim.webhook', { type, result: r }); return Response.json({ ok: true });
  } catch (e) { logError('esim.webhook_failed', { type, message: (e as Error).message }); return Response.json({ ok: false }, { status: 500 }); }   // 500 : le prestataire pourra réessayer ; le cron sert de filet
}
