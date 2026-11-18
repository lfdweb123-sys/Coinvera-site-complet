import crypto from 'node:crypto';
import { FieldValue, Transaction } from 'firebase-admin/firestore';
import { db } from './firebase-admin';
import { postEntry } from './ledger';
import { getSettings } from './settings';
// Active l'acces API ou cree la licence plugin (appele une seule fois, dans la transaction de confirmation d'une commande crypto).
export async function applyPurchase(tx: Transaction, merchantId: string, purpose: 'api' | 'plugin', orderId: string, usdUnits: number) {
  const s = await getSettings();
  if (purpose === 'api') tx.set(db.doc(`api_activations/${merchantId}`), { activated: true, activatedAt: FieldValue.serverTimestamp(), orderId }, { merge: true });
  else tx.create(db.collection('woocommerce_licenses').doc(), { merchantId, key: 'CV-' + crypto.randomBytes(12).toString('hex').toUpperCase().match(/.{4}/g)!.join('-'), status: 'active', sites: [], maxActivations: s.maxLicenseActivations, orderId, createdAt: FieldValue.serverTimestamp() });
  postEntry(tx, `purchase_${orderId}`, merchantId, 'purchase_' + purpose, [{ account: 'central:funds', dir: 'debit', amount: usdUnits }, { account: 'platform:revenue', dir: 'credit', amount: usdUnits }]);
  tx.create(db.collection('transactions').doc(), { merchantId, purpose, amount: usdUnits, mode: 'live', status: 'confirmed', method: 'crypto', orderId, title: purpose === 'api' ? 'Activation API' : 'Licence plugin', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
}
