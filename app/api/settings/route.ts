import { z } from 'zod';
import { db } from '@/lib/firebase-admin';
import { fail, requireUser } from '@/lib/auth';
import { safeUrl } from '@/lib/webhooks';
export async function GET(req: Request) {
  try { const u = await requireUser(req); const s = (await db.doc(`merchant_settings/${u.uid}`).get()).data() ?? {};
    return Response.json({ webhookUrl: s.webhookUrl ?? null, webhookSecret: s.webhookSecret, profile: { email: u.merchant.email, fullName: u.merchant.fullName, company: u.merchant.company, merchantCode: u.merchant.merchantCode } });
  } catch (e) { return fail(e); }
}
export async function PUT(req: Request) {
  try { const u = await requireUser(req); const { webhookUrl } = z.object({ webhookUrl: z.string().url().nullable() }).parse(await req.json());
    let url: string | null = null; try { url = webhookUrl ? safeUrl(webhookUrl) : null; } catch { return Response.json({ error: 'unsafe_url' }, { status: 400 }); }
    await db.doc(`merchant_settings/${u.uid}`).set({ webhookUrl: url }, { merge: true });
    return Response.json({ ok: true });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
