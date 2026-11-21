import { z } from 'zod';
import { db } from '@/lib/firebase-admin';
import { fail, requireUser } from '@/lib/auth';
import { MAX_WEBHOOKS, normalizeUrls, webhookUrlsOf } from '@/lib/webhook-urls';
export async function GET(req: Request) {
  try { const u = await requireUser(req); const s = (await db.doc(`merchant_settings/${u.uid}`).get()).data() ?? {}; const urls = webhookUrlsOf(s);
    return Response.json({ webhookUrls: urls, webhookUrl: urls[0] ?? null, webhookSecret: s.webhookSecret, profile: { email: u.merchant.email, fullName: u.merchant.fullName, company: u.merchant.company, merchantCode: u.merchant.merchantCode, storeUrl: s.storeUrl ?? '', createdAt: u.merchant.createdAt?.toDate?.().toISOString() ?? null, emailVerified: true } });
  } catch (e) { return fail(e); }
}
// Accepte { webhookUrls: string[] } (liste complète, 5 max) ou, pour compatibilité, { webhookUrl: string | null } (une seule URL).
const Body = z.union([z.object({ webhookUrls: z.array(z.string().url()).max(MAX_WEBHOOKS) }), z.object({ webhookUrl: z.string().url().nullable() }).transform(b => ({ webhookUrls: b.webhookUrl ? [b.webhookUrl] : [] }))]);
export async function PUT(req: Request) {
  try { const u = await requireUser(req); const { webhookUrls } = Body.parse(await req.json());
    let urls: string[]; try { urls = normalizeUrls(webhookUrls); } catch (e) { return Response.json({ error: e instanceof Error && e.message === 'webhook_limit' ? 'webhook_limit' : 'unsafe_url' }, { status: 400 }); }
    await db.doc(`merchant_settings/${u.uid}`).set({ webhookUrls: urls, webhookUrl: urls[0] ?? null }, { merge: true });   // webhookUrl = première URL, pour la compatibilité
    return Response.json({ ok: true, webhookUrls: urls });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
