import { z } from 'zod';
import { db } from '@/lib/firebase-admin';
import { fail, HttpError, requireUser } from '@/lib/auth';
import { validAddress } from '@/lib/address';
import { OPT } from '@/lib/payout-options';
const TH = [50, 100, 250, 500, 1000];
const Body = z.object({ chain: z.string().refine(c => c in OPT), address: z.string().max(120), autoPayout: z.boolean(), threshold: z.number().refine(n => TH.includes(n)) });
export async function GET(req: Request) {
  try { const u = await requireUser(req); const s = (await db.doc(`merchant_settings/${u.uid}`).get()).data() ?? {};
    return Response.json({ chain: s.payoutChain ?? 'TRX', address: s.payoutAddress ?? '', autoPayout: !!s.autoPayout, threshold: s.payoutThreshold ?? 50 });
  } catch (e) { return fail(e); }
}
export async function PUT(req: Request) {
  try { const u = await requireUser(req); const b = Body.parse(await req.json()); const address = b.address.trim();
    if (address && !validAddress(b.chain, address)) throw new HttpError(400, 'invalid_address');
    if (b.autoPayout && !address) throw new HttpError(400, 'address_required');
    await db.doc(`merchant_settings/${u.uid}`).set({ payoutChain: b.chain, payoutAddress: address, autoPayout: b.autoPayout, payoutThreshold: b.threshold, payoutUpdatedAt: new Date() }, { merge: true });
    return Response.json({ ok: true });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
