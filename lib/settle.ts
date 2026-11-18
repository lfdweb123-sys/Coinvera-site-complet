import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebase-admin';
import { postEntry, readBal, writeBal } from './ledger';
import { bps, toUnits } from './money';
import { getSettings } from './settings';
import { info } from './log';
// Credite le marchand UNE SEULE FOIS, uniquement apres confirmation lue aupres du prestataire (jamais sur un retour navigateur).
export async function settlePayment(paymentId: string, charge: { amount: number; fee: number }) {
  const s = await getSettings();
  await db.runTransaction(async tx => {
    const pRef = db.doc(`transactions/${paymentId}`); const p = await tx.get(pRef);
    if (!p.exists || p.data()!.status === 'confirmed') return;           // deja credite : on ne fait rien
    if (p.data()!.mode !== 'live') { tx.update(pRef, { status: 'confirmed', updatedAt: FieldValue.serverTimestamp() }); return; }
    const m = p.data()!.merchantId as string;
    const gross = toUnits(charge.amount), procFee = toUnits(charge.fee);
    if (gross !== p.data()!.amount) throw new Error('amount_mismatch');
    const platFee = bps(gross, s.platformFeeBps), net = gross - procFee - platFee, settled = gross - procFee;
    if (net <= 0) throw new Error('invalid_net');
    const bal = await readBal(tx, m);
    postEntry(tx, `payment_${paymentId}`, m, 'payment_settled', [
      { account: 'central:funds', dir: 'debit', amount: settled },
      { account: `merchant:${m}:available`, dir: 'credit', amount: net },
      { account: 'platform:revenue', dir: 'credit', amount: platFee }], { paymentId });
    writeBal(tx, m, { ...bal, available: bal.available + net, totalReceived: bal.totalReceived + gross, feesPaid: bal.feesPaid + procFee + platFee });
    info('payment.settled', { paymentId, merchantId: m, gross, procFee, platFee, net });
    tx.update(pRef, { status: 'confirmed', fees: { processing: procFee, platform: platFee, total: procFee + platFee }, net, updatedAt: FieldValue.serverTimestamp() });
  });
}
