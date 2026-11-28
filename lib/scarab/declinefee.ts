import { db } from '../firebase-admin';
import { postEntry, readBal, writeBal } from '../ledger';
import { notify } from '../audit';
import { info } from '../log';
import { centsToUnits } from './pricing';
import { cardRef } from './cards';
// Frais de refus de paiement : quand le réseau carte facture une pénalité à NOTRE portefeuille (événement card.fee_charged, type decline_violation :
// 2ᵉ et 3ᵉ refus d'une même carte), nous débitons le même montant à l'utilisateur propriétaire de la carte. Le 1er refus est gratuit.
// Ordre de prélèvement : d'abord le crédit cartes pro, puis le solde disponible. Si le solde ne couvre pas tout, il devient négatif (comme le portefeuille du
// prestataire) : le prochain encaissement ou dépôt le régularise, et aucune carte ne peut être créée ni rechargée tant qu'il n'est pas couvert.
// Idempotent : un identifiant d'écriture par carte et par numéro de refus ; un événement rejoué ne débite jamais deux fois.
export const PASSED_ON = ['decline_violation'];
export const splitFee = (bal: { scarab_credit?: number }, amt: number) => { const credit = Math.min(amt, Math.max(0, bal.scarab_credit ?? 0)); return { credit, avail: amt - credit }; };
type In = { uid: string; cardId: string; kind: string; amountMinor: number; violation?: number | null; txId?: string | null };
export async function chargeDeclineFee(p: In): Promise<{ charged: boolean; units: number; credit: number; avail: number; negative: number; id: string }> {
  const amt = centsToUnits(Math.max(0, Math.floor(Number(p.amountMinor) || 0))), none = { charged: false, units: 0, credit: 0, avail: 0, negative: 0, id: '' };
  if (!PASSED_ON.includes(p.kind) || amt <= 0) return none;
  const id = `scarab_declfee_${p.violation ? `${p.cardId}_v${p.violation}` : p.txId ? String(p.txId) : `${p.cardId}_${p.amountMinor}_${Math.floor(Date.now() / 60_000)}`}`;
  let out = { ...none, id }, last4 = '';
  await db.runTransaction(async tx => {
    const c = (await tx.get(cardRef(p.cardId))).data(); if (!c || c.merchantId !== p.uid) return;   // la carte doit appartenir à cet utilisateur
    if ((await tx.get(db.doc(`ledger_entries/${id}`))).exists) return;                              // déjà appliqué
    const bal = await readBal(tx, p.uid), s = splitFee(bal, amt); last4 = c.last4 ?? '';
    postEntry(tx, id, p.uid, 'scarab_decline_fee', [...(s.credit ? [{ account: `merchant:${p.uid}:scarab_credit`, dir: 'debit' as const, amount: s.credit }] : []), ...(s.avail ? [{ account: `merchant:${p.uid}:available`, dir: 'debit' as const, amount: s.avail }] : []), { account: 'central:funds', dir: 'credit', amount: amt }], { cardId: p.cardId, last4, violation: p.violation ?? null });
    const available = bal.available - s.avail; writeBal(tx, p.uid, { ...bal, available, scarab_credit: (bal.scarab_credit ?? 0) - s.credit });
    out = { charged: true, units: amt, credit: s.credit, avail: s.avail, negative: available < 0 ? -available : 0, id };
  });
  if (out.charged) {
    info('scarab.decline_fee', { cardId: p.cardId, merchantId: p.uid, units: out.units, violation: p.violation ?? null });
    const n = Number(p.violation ?? 0), usd = (u: number) => (u / 1e6).toFixed(2);
    await notify(p.uid, `Frais de refus de paiement : ${usd(out.units)} $`, `${usd(out.units)} $ ont été débités de votre ${out.avail && out.credit ? 'crédit cartes pro et de votre solde' : out.credit ? 'crédit cartes pro' : 'solde'} suite au refus n°${n || '…'} d’un paiement sur votre Virtuals cards pro •••• ${last4}. ${n >= 3 ? 'La carte a été fermée : son solde restant est remboursé sur votre solde, moins les frais de fermeture.' : 'Au prochain refus, de nouveaux frais seront débités et la carte sera fermée : gardez-la approvisionnée.'}${out.negative ? ` Votre solde est négatif de ${usd(out.negative)} $ : il sera régularisé par votre prochain encaissement ou dépôt.` : ''}`);
  }
  return out;
}
