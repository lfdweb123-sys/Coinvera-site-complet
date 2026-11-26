import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebase-admin';
import { HttpError } from './auth';
import { postEntry, readBal, writeBal } from './ledger';
import { toUnits } from './money';
import { getSettings } from './settings';
import { validAddress } from './address';
import { OPT, feeOf } from './payout-options';
import { withdrawFeeUsd } from './bybit-fees';
import { info, warn } from './log';
import { fromUnits } from './money';
import { notify, merchantEmail } from './audit';
import { receiptWithdrawal } from './receipt-events';
import { alertAdmins } from './admin-alert';
// Cree une demande de retrait : valide l'adresse (somme de controle), reserve les fonds, met en file. Utilise par le retrait manuel ET automatique.
export async function requestWithdrawal(uid: string, p: { chain: string; address: string; amountUnits: number; auto?: boolean }) {
  const s = await getSettings();
  const o = OPT[p.chain]; if (!o) throw new HttpError(400, 'unsupported_coin_or_network');
  const address = p.address.trim();
  if (!validAddress(p.chain, address)) { warn('withdraw.invalid_address', { merchantId: uid, chain: p.chain, address }); throw new HttpError(400, 'invalid_address'); }
  const fee = toUnits((await withdrawFeeUsd(o, feeOf(s as any, o))).usd), amt = p.amountUnits;   // frais réels de Bybit, payés par l'utilisateur
  if (amt < toUnits(s.minWithdrawalUsd) || amt > toUnits(s.maxWithdrawalUsd) || amt <= fee) throw new HttpError(400, 'amount_out_of_limits');
  const ref = db.collection('withdrawals').doc();
  await db.runTransaction(async tx => {
    const bal = await readBal(tx, uid);
    if (bal.available < amt) throw new HttpError(400, 'insufficient_balance');
    // Reservation : les fonds quittent le disponible AVANT tout envoi (protege contre les doubles depenses)
    postEntry(tx, `wd_reserve_${ref.id}`, uid, 'withdrawal_reserved', [{ account: `merchant:${uid}:available`, dir: 'debit', amount: amt }, { account: `merchant:${uid}:reserved`, dir: 'credit', amount: amt }]);
    writeBal(tx, uid, { ...bal, available: bal.available - amt, reserved: bal.reserved + amt });
    tx.set(ref, { merchantId: uid, coin: o.coin, chain: o.chain, option: o.id, address, amountUnits: amt, feeUnits: fee, sendUnits: amt - fee, auto: !!p.auto, mode: s.withdrawalMode === 'auto' ? 'auto' : 'manual', status: s.withdrawalMode === 'auto' ? 'queued' : 'pending_admin', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  });
  if (s.withdrawalMode !== 'auto') void merchantEmail(uid).catch(() => '').then(who => alertAdmins('Retrait à valider', ['Un utilisateur demande un retrait par adresse. Vérifiez l’adresse, envoyez les fonds puis validez dans Admin > Retraits.'], [['Utilisateur', who || uid], ['Réseau', `${o.coin} · ${o.chain}`], ['Adresse', address], ['Montant demandé', `${fromUnits(amt)} $`], ['Frais', `${fromUnits(fee)} $`], ['À envoyer (net)', `${fromUnits(amt - fee)} $`], ['Retrait', ref.id], ['Origine', p.auto ? 'retrait automatique par seuil' : 'demande de l’utilisateur']]));
  info('withdraw.queued', { withdrawalId: ref.id, merchantId: uid, chain: p.chain, address, amountUnits: amt, feeUnits: fee, auto: !!p.auto });
  return ref.id;
}

// Règlement d'un retrait (envoi confirmé ou échec/refus) : libère ou consomme la réservation, une seule fois. Utilisé par la tâche planifiée (Bybit) et par la validation manuelle de l'administrateur.
export async function finishWithdrawal(id: string, ok: boolean, extra: object, reason?: string) {
  const done = await db.runTransaction(async tx => {
    const r = db.doc(`withdrawals/${id}`); const w = (await tx.get(r)).data()!;
    if (['completed', 'failed'].includes(w.status)) return false;
    const bal = await readBal(tx, w.merchantId); const a = w.amountUnits as number, fee = (w.feeUnits ?? 0) as number, sent = a - fee;
    if (ok) {   // confirmé : le réservé disparaît ; l'envoi sort du compte central, les frais restent à la plateforme
      postEntry(tx, `wd_done_${id}`, w.merchantId, 'withdrawal_completed', [{ account: `merchant:${w.merchantId}:reserved`, dir: 'debit', amount: a }, { account: 'central:funds', dir: 'credit', amount: sent }, ...(fee ? [{ account: 'platform:revenue', dir: 'credit' as const, amount: fee }] : [])]);
      writeBal(tx, w.merchantId, { ...bal, reserved: bal.reserved - a, totalWithdrawn: bal.totalWithdrawn + a });
    } else {    // échec confirmé ou refus : libération du réservé
      postEntry(tx, `wd_release_${id}`, w.merchantId, 'withdrawal_released', [{ account: `merchant:${w.merchantId}:reserved`, dir: 'debit', amount: a }, { account: `merchant:${w.merchantId}:available`, dir: 'credit', amount: a }]);
      writeBal(tx, w.merchantId, { ...bal, reserved: bal.reserved - a, available: bal.available + a });
    }
    tx.update(r, { status: ok ? 'completed' : 'failed', ...extra, updatedAt: FieldValue.serverTimestamp() }); return true;
  });
  if (!done) return false;
  const m = (await db.doc(`withdrawals/${id}`).get()).data()!.merchantId;
  await notify(m, ok ? 'Retrait terminé' : 'Retrait refusé ou échoué', ok ? `Retrait ${id}` : `Retrait ${id}. ${reason ?? 'Les fonds ont été remis sur votre solde disponible.'}`);
  if (ok) await receiptWithdrawal(id);
  return true;
}
