import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../firebase-admin';
import { HttpError } from '../auth';
import { postEntry, readBal, writeBal } from '../ledger';
import { notify } from '../audit';
import { info, warn } from '../log';
import { sp, SpError, SpUnknown, publicCode } from './client';
import { centsToUnits } from './pricing';
import { cardRef, ownedCard, refreshCard, splitRefund } from './cards';

// Retrait d'une partie du solde d'une carte vers le solde Coinvera, selon la documentation du prestataire (POST /cards/{card}/withdraw) :
//  - montant d'au moins 1,00 $ ET au moins 1,00 $ doit rester sur la carte ; une opération toutes les 5 minutes par carte ;
//  - rien n'arrive au portefeuille tant que le réseau carte n'a pas confirmé : 200 (confirmé) ou 202 (à suivre) — dans les deux cas l'événement
//    card.withdrawn donne le montant NET exact (frais de retrait déduits) : c'est ce montant, et lui seul, qui est crédité à l'utilisateur ;
//  - card.withdrawal_failed : rien n'a été crédité, la carte est inchangée.
// Chaque demande a sa clé d'idempotence (une par carte, montant et tranche de 5 minutes) : un double clic ne retire jamais deux fois.
export const MIN_MINOR = 100;
const wdRef = (id: string) => db.doc(`scarab_withdrawals/${id}`);

export async function requestWithdrawal(uid: string, cardId: string, amountMinor: number) {
  if (!Number.isInteger(amountMinor) || amountMinor < MIN_MINOR) throw new HttpError(400, 'wd_below_minimum');
  await ownedCard(uid, cardId); const c = await refreshCard(uid, cardId);
  if (c?.status !== 'active' && c?.status !== 'frozen') throw new HttpError(409, 'card_state');
  const bal = Number(c?.balance_minor); if (Number.isFinite(bal) && bal - amountMinor < MIN_MINOR) throw new HttpError(400, bal - amountMinor < 0 ? 'wd_exceeds_balance' : 'wd_leaves_minimum');
  const idem = `cv-sp-wd-${cardId}-${amountMinor}-${Math.floor(Date.now() / 300_000)}`; const ref = wdRef(idem);
  try { await ref.create({ merchantId: uid, cardId, amountMinor, status: 'requested', createdAt: Date.now(), at: FieldValue.serverTimestamp() }); }
  catch { const s = (await ref.get()).data(); if (s && s.status !== 'failed') return { id: idem, status: s.status }; }   // même demande déjà en cours
  try { await sp('POST', `/cards/${cardId}/withdraw`, { body: { amount_minor: amountMinor }, idem }); }
  catch (e) {
    if (e instanceof SpUnknown) { await ref.update({ status: 'requested', note: 'unknown_outcome' }); return { id: idem, status: 'requested' }; }   // résultat incertain : le webhook ou l'admin tranchera, jamais de crédit « à l'aveugle »
    if (e instanceof SpError) {
      await ref.update({ status: 'failed', error: e.code, at: FieldValue.serverTimestamp() });
      const code = e.code === 'card:provider_busy' ? 'wd_busy' : e.code === 'amount_minor:exceeds_balance' ? 'wd_exceeds_balance' : e.code === 'amount_minor:leaves_below_minimum' ? 'wd_leaves_minimum' : e.code === 'amount_minor:below_minimum' ? 'wd_below_minimum' : publicCode(e);
      throw new HttpError(e.status === 429 ? 429 : 409, code);
    }
    throw e;
  }
  await ref.update({ status: 'sent' }); await refreshCard(uid, cardId).catch(() => {});
  return { id: idem, status: 'sent' };
}

// Événement card.withdrawn : crédite le montant NET exact, une seule fois par retrait (identifiant du retrait = clé du registre).
export async function onWithdrawn(cardId: string, d: any) {
  const amt = Number(d.amount_minor); const net = Number.isFinite(Number(d.net_amount_minor)) ? Number(d.net_amount_minor) : amt - (Number(d.fee_minor) || 0);
  const open = (await db.collection('scarab_withdrawals').where('cardId', '==', cardId).where('status', 'in', ['requested', 'sent']).get()).docs.filter(x => x.data().amountMinor === amt).sort((a, b) => a.data().createdAt - b.data().createdAt)[0];
  if (!open) { warn('scarab.withdrawn_unmatched', { cardId, amount: amt }); return false; }   // retrait fait depuis le portail du prestataire : l'argent est dans NOTRE portefeuille, rien à créditer
  return creditWithdrawal(open.ref, open.id, cardId, net, Number(d.fee_minor) || 0, d.wallet_transaction_id ?? null, ['requested', 'sent']);
}
async function creditWithdrawal(ref: FirebaseFirestore.DocumentReference, id: string, cardId: string, netMinor: number, feeMinor: number, walletTx: string | null, from: string[]) {
  const units = centsToUnits(Math.max(0, Math.floor(netMinor))); let uid = '', ok = false;
  await db.runTransaction(async tx => {
    const w = (await tx.get(ref)).data(); if (!w || !from.includes(w.status)) return; uid = w.merchantId;
    const cs = cardRef(cardId); const c = (await tx.get(cs)).data(); const bal = await readBal(tx, uid); const p = splitRefund(c, units);
    if (units > 0) { postEntry(tx, `scarab_wd_${id}`, uid, 'scarab_withdraw', [{ account: 'central:funds', dir: 'debit', amount: units }, ...(p.avail ? [{ account: `merchant:${uid}:available`, dir: 'credit' as const, amount: p.avail }] : []), ...(p.credit ? [{ account: `merchant:${uid}:scarab_credit`, dir: 'credit' as const, amount: p.credit }] : [])], { cardId, walletTransactionId: walletTx });
      writeBal(tx, uid, { ...bal, available: bal.available + p.avail, scarab_credit: (bal.scarab_credit ?? 0) + p.credit }); if (p.credit) tx.set(cs, { returnedToCredit: (c?.returnedToCredit ?? 0) + p.credit }, { merge: true }); }
    tx.update(ref, { status: 'confirmed', netUnits: units, feeMinor, at: FieldValue.serverTimestamp() }); ok = true;
  });
  if (ok) { info('scarab.withdrawn', { cardId, merchantId: uid, net: units }); await notify(uid, 'Retrait de carte confirmé', `${(units / 1e6).toFixed(2)} $ ont été ajoutés à votre solde (la part financée par votre dépôt retourne dans votre crédit cartes pro).`); await refreshCard(uid, cardId).catch(() => {}); }
  return ok;
}
// Admin : un retrait « à vérifier » est soit confirmé avec le montant NET lu dans le portail du prestataire, soit clos sans crédit.
export async function resolveWithdrawal(id: string, netMinor: number | null) {
  const ref = wdRef(id); const w = (await ref.get()).data(); if (!w || w.status !== 'review') throw new HttpError(409, 'scarab_wrong_state');
  if (netMinor == null) { await ref.update({ status: 'failed', error: 'closed_by_admin', at: FieldValue.serverTimestamp() }); return true; }
  if (!Number.isInteger(netMinor) || netMinor < 0 || netMinor > w.amountMinor) throw new HttpError(400, 'invalid_amount');
  return creditWithdrawal(ref, id, w.cardId, netMinor, w.amountMinor - netMinor, null, ['review']);
}
export async function onWithdrawalFailed(cardId: string, d: any) {
  const amt = Number(d.amount_minor);
  const open = (await db.collection('scarab_withdrawals').where('cardId', '==', cardId).where('status', 'in', ['requested', 'sent']).get()).docs.find(x => x.data().amountMinor === amt);
  if (!open) return false; await open.ref.update({ status: 'failed', error: 'network_refused', at: FieldValue.serverTimestamp() });
  await notify(open.data().merchantId, 'Retrait de carte refusé', 'Le retrait a été refusé par le réseau carte. Rien n’a été débité : le solde de votre carte est inchangé.'); return true;
}
// Filet de sécurité (cron) : un retrait sans nouvelle après 2 h passe en « à vérifier » dans l'admin (jamais de crédit deviné).
export async function flagStaleWithdrawals() {
  const q = await db.collection('scarab_withdrawals').where('status', 'in', ['requested', 'sent']).limit(100).get(), old = q.docs.filter(d => d.data().createdAt < Date.now() - 2 * 3600_000);   // filtre en code : évite un index composite
  for (const d of old) await d.ref.update({ status: 'review' }); return old.length;
}
export const withdrawalView = (id: string, w: Record<string, any>) => ({ id, status: w.status, amount: (w.amountMinor / 100).toFixed(2), net: w.netUnits != null ? (w.netUnits / 1e6).toFixed(2) : null });
export { cardRef };
