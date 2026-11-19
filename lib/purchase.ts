import crypto from 'node:crypto';
import { FieldValue, Transaction } from 'firebase-admin/firestore';
import { db } from './firebase-admin';
import { postEntry } from './ledger';
import { getSettings } from './settings';
export const licenseKey = () => 'CV-' + crypto.randomBytes(12).toString('hex').toUpperCase().match(/.{4}/g)!.join('-');
// Paiement unique : active l'API de production ET cree la licence du plugin WooCommerce (appele une seule fois, dans la transaction de confirmation).
export async function applyPurchase(tx: Transaction, merchantId: string, _purpose: string, orderId: string, usdUnits: number) {
  const s = await getSettings();
  tx.set(db.doc(`api_activations/${merchantId}`), { activated: true, activatedAt: FieldValue.serverTimestamp(), orderId }, { merge: true });
  tx.create(db.collection('woocommerce_licenses').doc(), { merchantId, key: licenseKey(), status: 'active', sites: [], maxActivations: s.maxLicenseActivations, orderId, createdAt: FieldValue.serverTimestamp() });
  postEntry(tx, `purchase_${orderId}`, merchantId, 'purchase_activation', [{ account: 'central:funds', dir: 'debit', amount: usdUnits }, { account: 'platform:revenue', dir: 'credit', amount: usdUnits }]);
  tx.create(db.collection('transactions').doc(), { merchantId, purpose: 'activation', amount: usdUnits, mode: 'live', status: 'confirmed', method: 'crypto', orderId, title: 'Activation du compte (API + plugin)', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
}
