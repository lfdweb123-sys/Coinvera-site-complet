import crypto from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebase-admin';
import { createCharge } from './processor';
import { postEntry } from './ledger';
import { toUnits } from './money';
import { getSettings } from './settings';
export async function startPurchase(uid: string, email: string, purpose: 'activation' | 'license') {
  const s = await getSettings();
  const usd = purpose === 'activation' ? s.apiActivationUsd : s.pluginPriceUsd;
  const ref = db.collection('transactions').doc();
  await ref.set({ merchantId: uid, purpose, amount: toUnits(usd), mode: 'live', status: 'pending', title: purpose, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  const ch = await createCharge('live', { amount: usd, title: purpose === 'activation' ? 'Activation API Coinvera' : 'Licence plugin WooCommerce', customer_email: email, description: ref.id });
  await ref.update({ processorChargeId: ch.id });
  return ch.checkout_url as string;
}
// Active l'acces / cree la licence UNE SEULE FOIS, apres confirmation lue aupres du prestataire.
export async function confirmPurchase(id: string, charge: { amount: number; fee: number }) {
  const s = await getSettings();
  await db.runTransaction(async tx => {
    const r = db.doc(`transactions/${id}`); const p = await tx.get(r); const d = p.data()!;
    if (d.status === 'confirmed') return;
    if (toUnits(charge.amount) !== d.amount) throw new Error('amount_mismatch');
    const act = db.doc(`api_activations/${d.merchantId}`);
    if (d.purpose === 'activation') tx.set(act, { activated: true, activatedAt: FieldValue.serverTimestamp(), paymentId: id }, { merge: true });
    else tx.create(db.collection('woocommerce_licenses').doc(), { merchantId: d.merchantId, key: 'CV-' + crypto.randomBytes(12).toString('hex').toUpperCase().match(/.{4}/g)!.join('-'),
      status: 'active', sites: [], maxActivations: s.maxLicenseActivations, paymentId: id, createdAt: FieldValue.serverTimestamp() });
    const net = d.amount - toUnits(charge.fee);
    postEntry(tx, `purchase_${id}`, d.merchantId, 'purchase_' + d.purpose, [{ account: 'central:funds', dir: 'debit', amount: net }, { account: 'platform:revenue', dir: 'credit', amount: net }]);
    tx.update(r, { status: 'confirmed', updatedAt: FieldValue.serverTimestamp() });
  });
}
