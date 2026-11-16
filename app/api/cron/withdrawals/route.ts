import { FieldValue } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { createWithdrawal, queryWithdrawal } from '@/lib/bybit';
import { postEntry, readBal, writeBal } from '@/lib/ledger';
import { fromUnits } from '@/lib/money';
import { notify } from '@/lib/audit';
async function finish(id: string, ok: boolean, extra: object) {
  await db.runTransaction(async tx => {
    const r = db.doc(`withdrawals/${id}`); const w = (await tx.get(r)).data()!;
    if (['completed', 'failed'].includes(w.status)) return;
    const bal = await readBal(tx, w.merchantId); const a = w.amountUnits as number;
    if (ok) {   // retrait confirme : le reserve disparait (les fonds ont quitte le compte central)
      postEntry(tx, `wd_done_${id}`, w.merchantId, 'withdrawal_completed', [{ account: `merchant:${w.merchantId}:reserved`, dir: 'debit', amount: a }, { account: 'central:funds', dir: 'credit', amount: a }]);
      writeBal(tx, w.merchantId, { ...bal, reserved: bal.reserved - a, totalWithdrawn: bal.totalWithdrawn + a });
    } else {    // echec confirme : liberation du reserve
      postEntry(tx, `wd_release_${id}`, w.merchantId, 'withdrawal_released', [{ account: `merchant:${w.merchantId}:reserved`, dir: 'debit', amount: a }, { account: `merchant:${w.merchantId}:available`, dir: 'credit', amount: a }]);
      writeBal(tx, w.merchantId, { ...bal, reserved: bal.reserved - a, available: bal.available + a });
    }
    tx.update(r, { status: ok ? 'completed' : 'failed', ...extra, updatedAt: FieldValue.serverTimestamp() });
  });
  const m = (await db.doc(`withdrawals/${id}`).get()).data()!.merchantId;
  await notify(m, ok ? 'Retrait terminé' : 'Retrait échoué', `Retrait ${id}`);
}
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return new Response('forbidden', { status: 403 });
  // 1) Envoi des retraits en file. 'processing' est reserve via transaction : un seul worker traite un retrait.
  for (const d of (await db.collection('withdrawals').where('status', '==', 'queued').limit(10).get()).docs) {
    const claimed = await db.runTransaction(async tx => { const s = await tx.get(d.ref); if (s.data()!.status !== 'queued') return false; tx.update(d.ref, { status: 'processing' }); return true; });
    if (!claimed) continue;
    const w = d.data();
    try {
      const r = await createWithdrawal({ coin: w.coin, chain: w.chain, address: w.address, amount: fromUnits(w.amountUnits).replace(/\.?0+$/, ''), requestId: d.id });
      if (r.retCode === 0) await d.ref.update({ status: 'broadcasted', bybitId: String(r.result.id) });
      else await finish(d.id, false, { error: `bybit_${r.retCode}` });       // refus explicite = echec confirme
    } catch { await d.ref.update({ status: 'needs_review' }); }               // timeout : etat inconnu, on NE libere PAS les fonds
  }
  // 2) Reconciliation : on ne marque 'completed' qu'apres statut reel Bybit.
  for (const d of (await db.collection('withdrawals').where('status', '==', 'broadcasted').limit(20).get()).docs) {
    const r = await queryWithdrawal(d.data().bybitId); const row = r.result?.rows?.[0];
    if (!row) continue;
    if (row.status === 'success') await finish(d.id, true, { txHash: row.txID });
    else if (['Fail', 'Rejected', 'CancelByUser', 'Reject'].includes(row.status) || ['fail', 'reject'].includes(String(row.status).toLowerCase())) await finish(d.id, false, { error: row.status });
  }
  return Response.json({ ok: true });
}
