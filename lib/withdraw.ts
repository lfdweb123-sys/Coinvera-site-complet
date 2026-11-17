import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebase-admin';
import { HttpError } from './auth';
import { postEntry, readBal, writeBal } from './ledger';
import { toUnits } from './money';
import { getSettings } from './settings';
import { validAddress } from './address';
// Cree une demande de retrait : valide l'adresse (somme de controle), reserve les fonds, met en file. Utilise par le retrait manuel ET automatique.
export async function requestWithdrawal(uid: string, p: { chain: string; address: string; amountUnits: number; auto?: boolean }) {
  const s = await getSettings();
  if (!s.chains.USDT.includes(p.chain)) throw new HttpError(400, 'unsupported_coin_or_network');
  const address = p.address.trim();
  if (!validAddress(p.chain, address)) throw new HttpError(400, 'invalid_address');
  const fee = toUnits((s as any)['withdrawalFee' + p.chain] ?? 1), amt = p.amountUnits;
  if (amt < toUnits(s.minWithdrawalUsd) || amt > toUnits(s.maxWithdrawalUsd) || amt <= fee) throw new HttpError(400, 'amount_out_of_limits');
  const ref = db.collection('withdrawals').doc();
  await db.runTransaction(async tx => {
    const bal = await readBal(tx, uid);
    if (bal.available < amt) throw new HttpError(400, 'insufficient_balance');
    // Reservation : les fonds quittent le disponible AVANT tout envoi (protege contre les doubles depenses)
    postEntry(tx, `wd_reserve_${ref.id}`, uid, 'withdrawal_reserved', [{ account: `merchant:${uid}:available`, dir: 'debit', amount: amt }, { account: `merchant:${uid}:reserved`, dir: 'credit', amount: amt }]);
    writeBal(tx, uid, { ...bal, available: bal.available - amt, reserved: bal.reserved + amt });
    tx.set(ref, { merchantId: uid, coin: 'USDT', chain: p.chain, address, amountUnits: amt, feeUnits: fee, sendUnits: amt - fee, auto: !!p.auto, status: 'queued', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  });
  return ref.id;
}
