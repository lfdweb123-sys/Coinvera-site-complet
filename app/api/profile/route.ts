import { z } from 'zod';
import { db } from '@/lib/firebase-admin';
import { fail, requireUser } from '@/lib/auth';
const Body = z.object({ company: z.string().min(2).max(120), storeUrl: z.string().max(200).refine(v => !v || /^https?:\/\//.test(v)).optional().default('') });
export async function PUT(req: Request) {
  try { const u = await requireUser(req); const b = Body.parse(await req.json());
    await db.doc(`merchants/${u.uid}`).update({ company: b.company, updatedAt: new Date() }); await db.doc(`merchant_settings/${u.uid}`).set({ storeUrl: b.storeUrl }, { merge: true });
    return Response.json({ ok: true });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
