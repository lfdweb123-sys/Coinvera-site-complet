import { z } from 'zod';
import { db } from '@/lib/firebase-admin';
import { verifyApiRequest } from '@/lib/apikey';
import { fail } from '@/lib/auth';
import { safeUrl } from '@/lib/webhooks';
// Enregistrement automatique du webhook (utilise par le plugin WooCommerce). PUT { url } -> { url, secret }
export async function GET(req: Request) {
  try { const a = await verifyApiRequest(req, ''); const s = (await db.doc(`merchant_settings/${a.merchantId}`).get()).data() ?? {}; return Response.json({ url: s.webhookUrl ?? null }); } catch (e) { return fail(e); }
}
export async function PUT(req: Request) {
  try { const raw = await req.text(); const a = await verifyApiRequest(req, raw); const { url } = z.object({ url: z.string().url() }).parse(JSON.parse(raw));
    let safe: string; try { safe = safeUrl(url); } catch { return Response.json({ error: 'unsafe_url' }, { status: 400 }); }
    const ref = db.doc(`merchant_settings/${a.merchantId}`); await ref.set({ webhookUrl: safe }, { merge: true });
    return Response.json({ url: safe, secret: (await ref.get()).data()!.webhookSecret });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
