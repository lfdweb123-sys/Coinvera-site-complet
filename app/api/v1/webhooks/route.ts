import { z } from 'zod';
import { db } from '@/lib/firebase-admin';
import { verifyApiRequest } from '@/lib/apikey';
import { fail } from '@/lib/auth';
import { addUrl, webhookUrlsOf } from '@/lib/webhook-urls';
// Enregistrement automatique du webhook (utilisé par les plugins WordPress). PUT { url } -> { url, urls, secret }
// L'URL est AJOUTÉE à la liste du compte (5 maximum) sans remplacer les autres : plusieurs plugins ou sites peuvent coexister.
export async function GET(req: Request) {
  try { const a = await verifyApiRequest(req, ''); const urls = webhookUrlsOf((await db.doc(`merchant_settings/${a.merchantId}`).get()).data());
    return Response.json({ url: urls[0] ?? null, urls });   // `url` conservé pour les anciennes versions des plugins
  } catch (e) { return fail(e); }
}
export async function PUT(req: Request) {
  try { const raw = await req.text(); const a = await verifyApiRequest(req, raw); const { url } = z.object({ url: z.string().url() }).parse(JSON.parse(raw));
    const ref = db.doc(`merchant_settings/${a.merchantId}`);
    // Transaction : deux plugins qui s'enregistrent en même temps ne s'écrasent pas.
    const out = await db.runTransaction(async t => {
      const s = (await t.get(ref)).data() ?? {};
      const urls = addUrl(webhookUrlsOf(s), url);
      t.set(ref, { webhookUrls: urls, webhookUrl: urls[0] ?? null }, { merge: true });   // webhookUrl = première URL, pour la compatibilité
      return { urls, secret: s.webhookSecret as string | undefined };
    });
    return Response.json({ url: addUrl([], url), urls: out.urls, secret: out.secret });
  } catch (e) {
    if (e instanceof z.ZodError) return Response.json({ error: 'invalid_request' }, { status: 400 });
    if (e instanceof Error && e.message === 'unsafe_url') return Response.json({ error: 'unsafe_url' }, { status: 400 });
    if (e instanceof Error && e.message === 'webhook_limit') return Response.json({ error: 'webhook_limit' }, { status: 409 });
    return fail(e);
  }
}
