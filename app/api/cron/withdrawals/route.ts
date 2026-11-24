import { cronAllowed } from '@/lib/cron';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { createWithdrawal, queryWithdrawal } from '@/lib/bybit';
import { postEntry, readBal, writeBal } from '@/lib/ledger';
import { fromUnits, toUnits } from '@/lib/money';
import { notify } from '@/lib/audit';
import { requestWithdrawal } from '@/lib/withdraw';
import { OPT } from '@/lib/payout-options';
import { priceUsd } from '@/lib/price';
import { receiptWithdrawal } from '@/lib/receipt-events';
import { info, warn, error } from '@/lib/log';
async function finish(id: string, ok: boolean, extra: object) {
  await db.runTransaction(async tx => {
    const r = db.doc(`withdrawals/${id}`); const w = (await tx.get(r)).data()!;
    if (['completed', 'failed'].includes(w.status)) return;
    const bal = await readBal(tx, w.merchantId); const a = w.amountUnits as number, fee = (w.feeUnits ?? 0) as number, sent = a - fee;
    if (ok) {   // confirme : le reserve disparait ; l'envoi sort du compte central, les frais restent a la plateforme
      postEntry(tx, `wd_done_${id}`, w.merchantId, 'withdrawal_completed', [{ account: `merchant:${w.merchantId}:reserved`, dir: 'debit', amount: a }, { account: 'central:funds', dir: 'credit', amount: sent }, ...(fee ? [{ account: 'platform:revenue', dir: 'credit' as const, amount: fee }] : [])]);
      writeBal(tx, w.merchantId, { ...bal, reserved: bal.reserved - a, totalWithdrawn: bal.totalWithdrawn + a });
    } else {    // echec confirme : liberation du reserve
      postEntry(tx, `wd_release_${id}`, w.merchantId, 'withdrawal_released', [{ account: `merchant:${w.merchantId}:reserved`, dir: 'debit', amount: a }, { account: `merchant:${w.merchantId}:available`, dir: 'credit', amount: a }]);
      writeBal(tx, w.merchantId, { ...bal, reserved: bal.reserved - a, available: bal.available + a });
    }
    tx.update(r, { status: ok ? 'completed' : 'failed', ...extra, updatedAt: FieldValue.serverTimestamp() });
  });
  const m = (await db.doc(`withdrawals/${id}`).get()).data()!.merchantId;
  await notify(m, ok ? 'Retrait terminé' : 'Retrait échoué', `Retrait ${id}`);
  if (ok) await receiptWithdrawal(id);
}
export async function GET(req: Request) {
  if (!cronAllowed(req)) return new Response('forbidden', { status: 403 });
  let auto = 0;
  // 0) Retraits automatiques : solde disponible >= seuil -> demande vers l'adresse enregistree
  for (const d of (await db.collection('merchant_settings').where('autoPayout', '==', true).limit(200).get()).docs) {
    try {
      const m = (await db.doc(`merchants/${d.id}`).get()).data(); if (m?.status !== 'active') continue;
      const s = d.data(); if (Date.now() - (s.payoutUpdatedAt?.toMillis?.() ?? 0) < 24 * 3600_000) continue;   // adresse modifiée il y a moins de 24 h : pas de retrait automatique
      const bal = (await db.doc(`balances/${d.id}`).get()).data() ?? {};
      if (s.payoutAddress && (bal.available ?? 0) >= toUnits(s.payoutThreshold ?? 50)) { await requestWithdrawal(d.id, { chain: s.payoutChain ?? 'TRX', address: s.payoutAddress, amountUnits: bal.available, auto: true }); auto++; }
    } catch (e) { warn('cron.auto_payout_skipped', { merchantId: d.id, reason: (e as Error).message }); }
  }
  // 1) Envoi des retraits en file. 'processing' est reserve via transaction : un seul worker traite un retrait.
  for (const d of (await db.collection('withdrawals').where('status', '==', 'queued').limit(10).get()).docs) {
    const claimed = await db.runTransaction(async tx => { const s = await tx.get(d.ref); if (s.data()!.status !== 'queued') return false; tx.update(d.ref, { status: 'processing' }); return true; });
    if (!claimed) continue;
    const w = d.data(); info('cron.sending', { withdrawalId: d.id, chain: w.chain });
    // Stablecoins : 1 USD = 1 unité. Coins volatils (BTC, ETH, LTC, XMR, SOL) : conversion au cours du moment de l'envoi.
    let amount = fromUnits(w.sendUnits ?? w.amountUnits); const cg = OPT[w.option ?? w.chain]?.cg;
    if (cg) {
      try { amount = (Math.floor((Number(amount) / (await priceUsd(cg))) * 1e8) / 1e8).toFixed(8); }
      catch (e) { warn('cron.quote_unavailable', { withdrawalId: d.id, message: (e as Error).message }); await d.ref.update({ status: 'queued' }); continue; }   // aucun envoi : on retentera au prochain passage
    }
    amount = amount.includes('.') ? amount.replace(/0+$/, '').replace(/\.$/, '') : amount;
    try {
      const r = await createWithdrawal({ coin: w.coin, chain: w.chain, address: w.address, amount, requestId: d.id });
      if (r.retCode === 0) await d.ref.update({ status: 'broadcasted', bybitId: String(r.result.id) });
      else await finish(d.id, false, { error: `bybit_${r.retCode}` });       // refus explicite = echec confirme
    } catch (e) { error('cron.send_unknown_state', { withdrawalId: d.id, message: (e as Error).message }); await d.ref.update({ status: 'needs_review' }); }               // timeout : etat inconnu, on NE libere PAS les fonds
  }
  // 2) Reconciliation : 'completed' uniquement apres statut reel.
  for (const d of (await db.collection('withdrawals').where('status', '==', 'broadcasted').limit(20).get()).docs) {
    const r = await queryWithdrawal(d.data().bybitId); const row = r.result?.rows?.[0];
    if (!row) continue;
    if (row.status === 'success') await finish(d.id, true, { txHash: row.txID });
    else if (['fail', 'reject', 'cancelbyuser'].includes(String(row.status).toLowerCase())) await finish(d.id, false, { error: row.status });
  }
  await db.doc('system/cron').set({ lastRun: Date.now() }); info('cron.done', { auto });
  return Response.json({ ok: true, auto });
}
