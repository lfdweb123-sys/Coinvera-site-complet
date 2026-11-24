import { db } from './firebase-admin';
import { sendReceipt, receiptNumber, usd, type Receipt } from './receipt';
import { warn } from './log';

// Un reçu PDF par transaction, envoyé par e-mail (jamais stocké). Chaque fonction relit le document APRÈS le règlement et ne lève jamais d'erreur.
const toDate = (v: any): Date => v?.toDate?.() ?? (typeof v === 'number' ? new Date(v) : new Date());
const safe = async (name: string, f: () => Promise<unknown>) => { try { await f(); } catch (e) { warn('receipt.event_failed', { name, message: (e as Error).message }); } };

/** Paiement encaissé : reçu détaillé (frais, net) au marchand ; reçu simple (montant payé) au client si son e-mail a été fourni. */
export const receiptPayment = (id: string) => safe('payment', async () => {
  const path = `transactions/${id}`; const x = (await db.doc(path).get()).data();
  if (!x || x.status !== 'confirmed' || x.mode !== 'live' || x.purpose) return;
  const base = { number: receiptNumber(id), date: toDate(x.updatedAt ?? x.createdAt), description: String(x.title ?? 'Paiement') };
  const ref: [string, string][] = x.orderRef ? [['Référence de commande', String(x.orderRef)]] : [];
  const merchant: Receipt = { ...base, heading: 'Reçu de paiement', rows: [...ref, ['Montant payé par le client', usd(x.amount)], ['Frais de traitement', `- ${usd(x.fees?.processing ?? 0)}`], ['Frais Coinvera', `- ${usd(x.fees?.platform ?? 0)}`]], totalLabel: 'Net crédité sur votre solde', total: usd(x.net ?? 0) };
  await sendReceipt(path, merchant, [], { merchantId: x.merchantId });
  if (x.customerEmail) await sendReceipt(path, { ...base, heading: 'Reçu de paiement', rows: ref, totalLabel: 'Montant payé', total: usd(x.amount), footnote: 'Ce reçu atteste de votre paiement. Pour toute question sur votre commande, contactez le vendeur.' }, [x.customerEmail], { flag: 'payerReceiptSentAt' });
});

/** Retrait terminé (uniquement en cas de succès) : montant, frais, montant envoyé, adresse et hash de transaction. */
export const receiptWithdrawal = (id: string) => safe('withdrawal', async () => {
  const path = `withdrawals/${id}`; const w = (await db.doc(path).get()).data();
  if (!w || w.status !== 'completed') return;
  const sent = w.amountUnits - (w.feeUnits ?? 0); const rows: [string, string][] = [['Montant du retrait', usd(w.amountUnits)], ['Frais de retrait', `- ${usd(w.feeUnits ?? 0)}`], ['Réseau', `${w.coin ?? ''} ${w.chain ?? ''}`.trim() || '—'], ['Adresse de destination', String(w.address ?? '—')]];
  if (w.txHash) rows.push(['Hash de la transaction', String(w.txHash)]);
  await sendReceipt(path, { number: receiptNumber(id), date: toDate(w.updatedAt ?? w.createdAt), heading: 'Reçu de retrait', description: 'Retrait de fonds vers votre portefeuille', rows, totalLabel: 'Montant envoyé', total: usd(sent) }, [], { merchantId: w.merchantId });
});

/** Achat unique (activation API + licence plugin) : le reçu part avec l'identifiant de commande crypto. */
export const receiptActivation = (orderId: string) => safe('activation', async () => {
  const path = `crypto_orders/${orderId}`; const o = (await db.doc(path).get()).data();
  if (!o || o.status !== 'confirmed') return;
  const rows: [string, string][] = [['Produit', 'Activation du compte (API de production + licence des plugins)'], ['Moyen de paiement', String(o.cur ?? 'crypto').toUpperCase()]];
  if (o.txid && !String(o.txid).startsWith('manual-')) rows.push(['Hash de la transaction', String(o.txid)]);
  await sendReceipt(path, { number: receiptNumber(orderId), date: toDate(o.confirmedAt), heading: 'Reçu d’achat', description: 'Activation du compte Coinvera', rows, totalLabel: 'Total payé', total: usd(o.usd) }, [], { merchantId: o.merchantId });
});

/** Carte virtuelle émise ou rechargée (opération réussie uniquement). */
export const receiptCardOrder = (id: string) => safe('card', async () => {
  const path = `card_orders/${id}`; const o = (await db.doc(path).get()).data();
  if (!o || o.status !== 'confirmed') return;
  const issue = o.kind === 'issue'; const fees = Math.max(0, (o.chargeUnits ?? 0) - (o.amount ?? 0));
  await sendReceipt(path, { number: receiptNumber(id), date: toDate(o.updatedAt ?? o.createdAtMs), heading: 'Reçu carte virtuelle', description: issue ? 'Émission d’une carte virtuelle' : 'Recharge d’une carte virtuelle',
    rows: [['Montant chargé sur la carte', usd(o.amount ?? 0)], ['Frais', usd(fees)]], totalLabel: 'Total débité', total: usd(o.chargeUnits ?? 0) }, [], { merchantId: o.merchantId });
});

/** Dépôt sur le crédit cartes (y compris paiement arrivé après expiration). */
export const receiptCardDeposit = (id: string) => safe('deposit', async () => {
  const path = `card_pay_orders/${id}`; const o = (await db.doc(path).get()).data();
  if (!o || !['fulfilled', 'late_credited'].includes(o.status) || o.spec?.kind !== 'deposit') return;
  await sendReceipt(path, { number: receiptNumber(id), date: new Date(), heading: 'Reçu de dépôt', description: 'Dépôt sur votre crédit cartes',
    rows: [['Montant payé', usd(o.chargeUnits ?? 0)], ['Frais du prestataire de paiement', `- ${usd(Math.max(0, (o.chargeUnits ?? 0) - (o.creditedUnits ?? 0)))}`]], totalLabel: 'Crédit cartes ajouté', total: usd(o.creditedUnits ?? 0) }, [], { merchantId: o.merchantId });
});

/** Virtuals cards pro : carte émise ou rechargée (succès uniquement). */
export const receiptScarabOrder = (id: string) => safe('scarab_order', async () => {
  const path = `scarab_orders/${id}`; const o = (await db.doc(path).get()).data();
  if (!o || o.status !== 'confirmed') return;
  await sendReceipt(path, { number: receiptNumber(id), date: toDate(o.updatedAt ?? o.createdAtMs), heading: 'Reçu carte virtuelle', description: o.kind === 'issue' ? 'Émission d’une Virtuals cards pro' : 'Recharge d’une Virtuals cards pro',
    rows: [['Montant chargé sur la carte', usd(Math.round((o.amountMinor ?? 0) * 10_000))], ['Frais', usd(Math.round((o.feeMinor ?? 0) * 10_000))]], totalLabel: 'Total débité', total: usd(o.chargeUnits ?? 0) }, [], { merchantId: o.merchantId });
});

/** Virtuals cards pro : dépôt crédité. */
export const receiptScarabDeposit = (id: string) => safe('scarab_deposit', async () => {
  const path = `scarab_pay_orders/${id}`; const o = (await db.doc(path).get()).data();
  if (!o || !o.deposit || o.status !== 'fulfilled') return;
  await sendReceipt(path, { number: receiptNumber(id), date: new Date(), heading: 'Reçu de dépôt', description: 'Dépôt sur votre crédit Virtuals cards pro',
    rows: [['Montant payé', usd(o.chargeUnits ?? 0)]], totalLabel: 'Crédit ajouté', total: usd(o.creditedUnits ?? 0) }, [], { merchantId: o.merchantId });
});
