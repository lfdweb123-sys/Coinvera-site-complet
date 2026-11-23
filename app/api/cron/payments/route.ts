import { cronAllowed } from '@/lib/cron';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { getCharge } from '@/lib/processor';
import { settlePayment } from '@/lib/settle';
import { notifyMerchant } from '@/lib/webhooks';
import { notify } from '@/lib/audit';
import { info, warn } from '@/lib/log';
// Filet de securite : relit aupres du prestataire les paiements restes "pending" (webhook manque) et expire les anciens.
export async function GET(req: Request) {
  if (!cronAllowed(req)) return new Response('forbidden', { status: 403 });
  const now = Date.now(); let checked = 0, settled = 0, expired = 0;
  for (const d of (await db.collection('transactions').where('status', '==', 'pending').limit(100).get()).docs) {
    const x = d.data(); if (x.purpose) continue; const created = x.createdAt?.toMillis?.() ?? 0; const old = now - created > 24 * 3600_000;
    if (!x.processorChargeId) { if (now - created > 3600_000) { await d.ref.update({ status: 'expired', updatedAt: FieldValue.serverTimestamp() }); expired++; } continue; }
    if (now - created < 90_000) continue;
    try { const ch = await getCharge(x.mode, x.processorChargeId); checked++;
      if (ch.status === 'paid') { await settlePayment(d.id, ch); settled++; if (x.mode === 'live') { await notify(x.merchantId, 'Paiement confirmé', `Transaction ${d.id}`); await notifyMerchant(x.merchantId, 'payment.confirmed', { id: d.id, orderRef: x.orderRef ?? null }); } }
      else if (old) { await d.ref.update({ status: 'expired', updatedAt: FieldValue.serverTimestamp() }); expired++; }
    } catch (e) { warn('cron.payment_check_failed', { transactionId: d.id, message: (e as Error).message }); }
  }
  await db.doc('system/cron_payments').set({ lastRun: now }); info('cron.payments_done', { checked, settled, expired });
  return Response.json({ ok: true, checked, settled, expired });
}
