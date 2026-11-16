import crypto from 'node:crypto';
import { db } from '@/lib/firebase-admin';
import { getCharge } from '@/lib/processor';
import { settlePayment } from '@/lib/settle';
import { confirmPurchase } from '@/lib/purchase';
import { notifyMerchant } from '@/lib/webhooks';
import { notify } from '@/lib/audit';
export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get('x-nowpayments-sig') ?? '';
  const exp = crypto.createHmac('sha512', process.env.PROCESSOR_WEBHOOK_SECRET!).update(raw).digest('hex');
  const a = Buffer.from(exp), b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return new Response('invalid signature', { status: 400 });
  const ev = JSON.parse(raw);
  // ATTENTION : le champ portant l'identifiant du paiement n'est pas documente : verifiez-le sur un vrai webhook de test.
  const chargeId = ev.charge_id ?? ev.id ?? ev.payment_id ?? ev.order_id;
  if (!chargeId) return new Response('ok');
  const q = await db.collection('transactions').where('processorChargeId', '==', String(chargeId)).limit(1).get();
  if (q.empty) return new Response('ok');
  const p = q.docs[0], d = p.data();
  const ch = await getCharge(d.mode, String(chargeId));            // double controle aupres du prestataire
  if (ch.status !== 'paid') return new Response('ok');
  if (d.purpose) await confirmPurchase(p.id, ch); else await settlePayment(p.id, ch);
  if (!d.purpose && d.mode === 'live' && d.status !== 'confirmed') {
    await notify(d.merchantId, 'Paiement confirmé', `Transaction ${p.id}`);
    await notifyMerchant(d.merchantId, 'payment.confirmed', { id: p.id, orderRef: d.orderRef ?? null });
  }
  return new Response('OK');
}
