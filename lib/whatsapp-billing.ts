import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebase-admin';
import { postEntry, readBal, writeBal } from './ledger';
import { toUnits } from './money';
import { getSettings } from './settings';
import { warn } from './log';

export type WhatsAppCategory = 'cart' | 'status';

/** Appelé juste après l'envoi (hors mode test) : garde le lien entre l'identifiant du message Meta et le marchand,
 *  pour que le webhook de statut sache ensuite qui facturer. Pas encore de coût engagé à ce stade. */
export async function recordSentMessage(messageId: string, merchantId: string, category: WhatsAppCategory) {
  await db.doc(`whatsapp_messages/${messageId}`).set({ merchantId, category, status: 'sent', createdAt: FieldValue.serverTimestamp() });
}

/** Meta facture Coinvera uniquement sur message délivré — jamais sur un envoi resté sans réponse, bloqué ou échoué.
 *  On applique exactement la même règle au marchand : le débit n'a lieu qu'ici, au statut 'delivered' du webhook,
 *  jamais au moment de l'envoi. Idempotent (un webhook Meta peut être reçu plusieurs fois pour le même événement). */
export async function billDeliveredMessage(messageId: string, metaStatus: string) {
  const ref = db.doc(`whatsapp_messages/${messageId}`);
  if (metaStatus === 'failed') { await ref.set({ status: 'failed' }, { merge: true }); return; }
  if (metaStatus !== 'delivered') return;   // 'sent' et 'read' ne déclenchent aucune facturation
  const s = await getSettings();
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()!.status !== 'sent') return;   // déjà facturé, échoué, ou message inconnu : on ne rejoue rien
    const { merchantId, category } = snap.data() as { merchantId: string; category: WhatsAppCategory };
    const rateUsd = category === 'cart' ? s.whatsappRateCartUsd : s.whatsappRateStatusUsd;
    const amount = toUnits(rateUsd);
    const bal = await readBal(tx, merchantId);
    postEntry(tx, `wa_bill_${messageId}`, merchantId, 'whatsapp_message_billed',
      [{ account: `merchant:${merchantId}:available`, dir: 'debit', amount }, { account: 'platform:revenue', dir: 'credit', amount }], { messageId, category });
    const nextAvailable = bal.available - amount;
    writeBal(tx, merchantId, { ...bal, available: nextAvailable, feesPaid: bal.feesPaid + amount });
    tx.set(ref, { status: 'delivered', billedUnits: amount }, { merge: true });
    if (nextAvailable < 0) warn('whatsapp.balance_negative', { merchantId, available: nextAvailable });
  });
}
