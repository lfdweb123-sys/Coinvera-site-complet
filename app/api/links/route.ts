import crypto from 'node:crypto';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { fail, requireUser } from '@/lib/auth';
import { toUnits } from '@/lib/money';
import { byMerchant } from '@/lib/serialize';
import { info } from '@/lib/log';
import { SITE } from '@/lib/site';
const Body = z.object({ title: z.string().min(2).max(100), amount: z.number().min(1).max(50000), description: z.string().max(300).optional().default('') });
export async function GET(req: Request) {
  try { const u = await requireUser(req); const r = await byMerchant('payment_links', u.uid, req, (x: any) => !x.deleted); return Response.json({ ...r, items: r.items.map((x: any) => ({ ...x, url: `${SITE}/pay/${x.id}` })) }); } catch (e) { return fail(e); }
}
export async function POST(req: Request) {
  try { const u = await requireUser(req); const b = Body.parse(await req.json()); const id = crypto.randomBytes(7).toString('base64url');
    await db.doc(`payment_links/${id}`).set({ merchantId: u.uid, title: b.title, description: b.description, amount: toUnits(b.amount), active: true, uses: 0, createdAt: FieldValue.serverTimestamp() });
    info('link.created', { linkId: id, merchantId: u.uid, amount: b.amount }); return Response.json({ id, url: `${SITE}/pay/${id}` }, { status: 201 });
  } catch (e) { return e instanceof Error && e.name === 'ZodError' ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
