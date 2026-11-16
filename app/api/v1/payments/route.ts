import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { verifyApiRequest } from '@/lib/apikey';
import { fail, HttpError } from '@/lib/auth';
import { createCharge } from '@/lib/processor';
import { getSettings } from '@/lib/settings';
import { toUnits } from '@/lib/money';
const Body = z.object({ amount: z.number().min(1).max(50000), title: z.string().min(1).max(120), customerEmail: z.string().email().optional(), orderRef: z.string().max(80).optional() });
export async function POST(req: Request) {
  try {
    const raw = await req.text();
    const a = await verifyApiRequest(req, raw);
    const body = Body.parse(JSON.parse(raw));
    const idem = req.headers.get('idempotency-key');
    if (idem) { const ex = await db.doc(`idempotency_records/pay_${a.merchantId}_${idem}`).get();
      if (ex.exists) return Response.json(ex.data()!.response); }
    const s = await getSettings();
    // Essais gratuits comptes cote serveur (par marchand, pas par cle) : recreer une cle ne les remet pas a zero.
    let mode: 'test' | 'live' = 'live';
    const act = db.doc(`api_activations/${a.merchantId}`);
    await db.runTransaction(async tx => {
      const d = (await tx.get(act)).data() ?? { activated: false, trialsUsed: 0 };
      if (d.activated && a.mode === 'live') { mode = 'live'; return; }
      if (d.trialsUsed >= s.freeTrials) throw new HttpError(402, 'activation_required');
      mode = 'test'; tx.set(act, { ...d, trialsUsed: d.trialsUsed + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    const ref = db.collection('transactions').doc();
    await ref.set({ merchantId: a.merchantId, amount: toUnits(body.amount), currency: 'USD', title: body.title, orderRef: body.orderRef ?? null,
      mode, status: 'pending', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    const ch = await createCharge(mode, { amount: body.amount, title: body.title, customer_email: body.customerEmail, description: ref.id });
    await ref.update({ processorChargeId: ch.id });
    const response = { id: ref.id, status: 'pending', amount: body.amount, mode, checkoutUrl: ch.checkout_url,
      fees: { processingBps: s.processingFeeBps, platformBps: s.platformFeeBps, totalBps: s.processingFeeBps + s.platformFeeBps } };
    if (idem) await db.doc(`idempotency_records/pay_${a.merchantId}_${idem}`).set({ response, createdAt: Date.now() });
    return Response.json(response, { status: 201 });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request', issues: e.issues }, { status: 400 }) : fail(e); }
}
