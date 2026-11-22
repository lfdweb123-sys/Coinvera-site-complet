import crypto from 'node:crypto';
import { db } from '../firebase-admin';
import { notify } from '../audit';
import { warn } from '../log';
import { readKyc } from './holder';
import { syncCards, checkClose } from './cards';
import { reconcileByCiOrder } from './orders';
import { checkPayOrder } from './pay';
// Signature : HMAC-SHA256 hexadécimal du corps BRUT, clé = secret de l'endpoint (x-cryptoinfra-signature).
export function verifySignature(raw: string, given: string, secret: string) {
  const a = Buffer.from(crypto.createHmac('sha256', secret).update(raw).digest('hex'), 'utf8'), b = Buffer.from(given, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// Les webhooks sont des signaux : chaque événement déclenche une relecture à la source, jamais une écriture directe depuis la charge utile.
export async function handleEvent(event: string, p: any) {
  if (!event.startsWith('card.') && event !== 'deposit.credited') return 'ignored';        // cet endpoint reçoit aussi les paiements du projet : hors périmètre cartes
  const ext = String(p?.userExternalId ?? ''); const m = ext ? (await db.doc(`card_holder_ids/${ext}`).get()).data() : null;
  if (!m) { warn('cards.webhook_unknown_user', { event }); return 'unknown_user'; }
  const uid = m.uid as string;
  if (event === 'deposit.credited') {
    // Dépôt sur l'adresse personnelle de l'utilisateur : signal seulement. Chaque demande de paiement en attente est relue à la source (blockchain, montant exact) et traitée une seule fois.
    for (const st of ['awaiting', 'expired']) for (const d of (await db.collection('card_pay_orders').where('merchantId', '==', uid).where('status', '==', st).limit(20).get()).docs)
      await checkPayOrder(uid, d.id).catch(e => warn('cards.webhook_deposit_check_failed', { payOrderId: d.id, message: (e as Error).message }));
    return 'ok';
  }
  switch (event) {
    case 'card.topup': case 'card.withdraw': case 'card.status':
      if (p.orderId != null) await reconcileByCiOrder(Number(p.orderId));
      if (p.cardId != null) { await syncCards(uid); if (event !== 'card.topup') await checkClose(uid, Number(p.cardId)); }
      break;
    case 'card.kyc': await readKyc(uid); break;
    case 'card.wallet_otp': await db.doc(`card_items/${p.cardId}`).set({ merchantId: uid, otpWaiting: true, otpKind: p.otpKind ?? null, otpAt: Date.now() }, { merge: true }); break;   // jamais le code : il est lu à la demande
    case 'card.transaction': { const t = p.transaction; if (t?.transType === 170 && t?.transStatus === 2) await notify(uid, 'Paiement par carte', `${t.merchantName ?? ''} ${t.transCurrencyAmt ?? ''} ${t.transCurrency ?? ''}`.trim()); break; }
  }
  return 'ok';
}
