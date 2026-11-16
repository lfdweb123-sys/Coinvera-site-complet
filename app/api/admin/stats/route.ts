import { db } from '@/lib/firebase-admin';
import { fail, requireAdmin } from '@/lib/auth';
import { fromUnits } from '@/lib/money';
export async function GET(req: Request) {
  try { await requireAdmin(req);
    const cnt = async (q: FirebaseFirestore.Query) => (await q.count().get()).data().count;
    const [merchants, active, pay, wdPending, payPending, review, tickets] = await Promise.all([
      cnt(db.collection('merchants')), cnt(db.collection('merchants').where('status', '==', 'active')),
      cnt(db.collection('transactions').where('status', '==', 'confirmed')), cnt(db.collection('withdrawals').where('status', 'in', ['queued', 'processing', 'broadcasted'])),
      cnt(db.collection('transactions').where('status', '==', 'pending')), cnt(db.collection('withdrawals').where('status', '==', 'needs_review')), cnt(db.collection('support_tickets').where('status', '==', 'New'))]);
    let volume = 0, fees = 0; (await db.collection('balances').get()).forEach(d => { volume += d.data().totalReceived ?? 0; fees += d.data().feesPaid ?? 0; });
    return Response.json({ merchants, active, confirmedPayments: pay, pendingWithdrawals: wdPending, pendingPayments: payPending, withdrawalsToReview: review, newTickets: tickets, volume: fromUnits(volume), feesGenerated: fromUnits(fees) });
  } catch (e) { return fail(e); }
}
