import crypto from 'node:crypto';
import { db } from '../firebase-admin';
import { enc, dec } from '../apikey';
import { notify } from '../audit';
import { chargeCardFee } from './declinefee';
import { warn } from '../log';
import { onKycEvent } from './customers';
import { cardRef, creditTermination, refreshCard } from './cards';
import { onWithdrawn, onWithdrawalFailed } from './withdraw';
import { finalize, openOrdersForCard, reconcileOpenIssues } from './orders';

// Signature : en-tête `t=<secondes>, v1=<hex>` ; v1 = HMAC-SHA256 hexadécimal de « <t>.<corps BRUT> », clé = secret de l'endpoint (texte, tel quel).
// La tolérance sur l'horodatage protège contre le rejeu d'une livraison interceptée.
export function parseSignature(h: string) { const t = /(?:^|[,\s])t=(\d+)/.exec(h)?.[1], v = /(?:^|[,\s])v1=([0-9a-f]+)/i.exec(h)?.[1]; return t && v ? { t: Number(t), v1: v.toLowerCase() } : null; }
export function verifyWebhook(raw: string, header: string, secret: string, nowMs = Date.now(), toleranceSec = 900) {
  const p = parseSignature(header); if (!p || Math.abs(nowMs / 1000 - p.t) > toleranceSec) return false;
  const a = Buffer.from(crypto.createHmac('sha256', secret).update(`${p.t}.${raw}`).digest('hex'), 'utf8'), b = Buffer.from(p.v1, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const uidOfCard = async (cardId: string) => ((await cardRef(cardId).get()).data()?.merchantId as string | undefined) ?? null;

// Code à usage unique (3-D Secure, Apple Pay / Google Pay) : seul le titulaire doit le voir, et tout de suite. Livré UNE fois par ScarabPay, jamais rejoué.
// Pour qu'il atteigne le titulaire sans qu'il reste ici : chiffré, valable quelques minutes au plus (échéance du prestataire), effacé à la première lecture,
// jamais journalisé ni affiché au support. La notification ne contient pas le code.
async function relayCode(uid: string, cardId: string, d: any) {
  const expiresAt = d.expires_at ? Math.min(Date.parse(d.expires_at) || Infinity, Date.now() + 10 * 60_000) : Date.now() + 5 * 60_000;
  await db.doc(`scarab_codes/${cardId}`).set({ merchantId: uid, enc: enc(String(d.activation_code)), purpose: d.purpose === 'wallet' ? 'wallet' : 'purchase', merchant: d.merchant_name ?? null, amount: d.amount_minor != null ? (Number(d.amount_minor) / 100).toFixed(2) : null, currency: d.currency ?? null, expiresAt });
  await cardRef(cardId).set({ codeWaiting: true, updatedAt: Date.now() }, { merge: true });
}
// Lecture unique : le document est supprimé dans la même transaction que la lecture.
export async function takeCode(uid: string, cardId: string) {
  const ref = db.doc(`scarab_codes/${cardId}`); let out: any = null;
  await db.runTransaction(async tx => {
    const o = (await tx.get(ref)).data(); if (!o || o.merchantId !== uid) return;
    tx.delete(ref); if (o.expiresAt < Date.now()) return;
    out = { code: dec(o.enc), purpose: o.purpose, merchant: o.merchant, amount: o.amount, currency: o.currency, expiresInSeconds: Math.max(0, Math.round((o.expiresAt - Date.now()) / 1000)) };
  });
  await cardRef(cardId).set({ codeWaiting: false }, { merge: true }); return out;
}
export async function purgeExpiredCodes() {
  const q = await db.collection('scarab_codes').where('expiresAt', '<', Date.now()).limit(200).get(); const b = db.batch(); q.docs.forEach(d => b.delete(d.ref)); await b.commit(); return q.size;
}

// Les webhooks sont des SIGNAUX : chaque événement déclenche une relecture à la source, jamais une écriture directe depuis la charge utile
// (seules exceptions : le montant remboursé d'une fermeture et les frais exacts d'une recharge, qui n'existent nulle part ailleurs).
export async function handleEvent(type: string, d: any) {
  if (type.startsWith('customer.kyc.')) { if (d?.customer_id) await onKycEvent(String(d.customer_id), type, d.reason); return 'ok'; }
  if (type.startsWith('withdrawal.') || type === 'deposit.credited') return 'ignored';   // retraits et dépôts du portefeuille : gérés dans le portail ScarabPay
  const cid = d?.card_id ? String(d.card_id) : ''; if (!cid) return 'ignored';
  const uid = await uidOfCard(cid);
  if (!uid) { warn('scarab.webhook_unknown_card', { type }); return 'unknown_card'; }
  switch (type) {
    case 'card.issued': case 'card.issue_failed': {
      await refreshCard(uid, cid).catch(() => {});
      const mine = await openOrdersForCard(cid, 'issue');
      if (mine.length) { for (const o of mine) { if (type === 'card.issued') await finalize(o.id, true, {}); else await finalize(o.id, false, { error: 'provider_rejected' }); } }
      else await reconcileOpenIssues();   // 202 sans identifiant de carte : on rejoue la clé des créations en attente pour apprendre laquelle vient d'aboutir
      break;
    }
    case 'card.recharged': case 'card.recharge_failed': {
      const amt = Number(d.amount_minor); const o = (await openOrdersForCard(cid, 'topup')).find(x => x.data().amountMinor === amt);
      if (o) { if (type === 'card.recharged') await finalize(o.id, true, { feeMinor: Number.isFinite(Number(d.fee_minor)) ? Number(d.fee_minor) : undefined }); else await finalize(o.id, false, { error: 'provider_rejected' }); }
      await refreshCard(uid, cid).catch(() => {}); break;
    }
    case 'card.frozen': case 'card.unfrozen': case 'card.expired': await refreshCard(uid, cid).catch(() => {}); break;
    case 'card.withdrawn': await onWithdrawn(cid, d); break;
    case 'card.withdrawal_failed': await onWithdrawalFailed(cid, d); break;
    case 'card.terminated': await creditTermination(cid, Number(d.refunded_amount_minor ?? 0)); break;
    case 'card.activation_code': if (d.activation_code) { await relayCode(uid, cid, d); await notify(uid, 'Code de vérification disponible', `Ouvrez votre Virtuals cards pro •••• ${d.last4 ?? ''} pour l’afficher. Il expire dans quelques minutes.`); } break;
    case 'card.transaction.declined': {
      await refreshCard(uid, cid).catch(() => {});
      // Dès le 2ᵉ refus, le message « frais débités » (card.fee_charged) prend le relais : on n'envoie ici que l'explication de la règle.
      const n = Number((await cardRef(cid).get()).data()?.declineCount ?? 0);
      if (n < 2) await notify(uid, 'Paiement refusé', 'Un paiement a été refusé sur votre Virtuals cards pro. Le premier refus d’une carte est gratuit ; les suivants entraînent des frais débités de votre solde, et au 3ᵉ refus la carte est fermée. Gardez-la approvisionnée.');
      break;
    }
    case 'card.fee_charged': {
      // Facturé à NOTRE portefeuille par le réseau carte : suivi dans l'admin, et répercuté à l'utilisateur pour les refus de paiement et les paiements hors États-Unis (voir declinefee.ts).
      const amountMinor = Number(d.amount_minor ?? 0), violation = d.violation_count != null ? Number(d.violation_count) : null;
      const r = await chargeCardFee({ uid, cardId: cid, kind: String(d.kind ?? ''), amountMinor, violation, txId: d.transaction_id ? String(d.transaction_id) : null });
      await db.doc(`scarab_fees/${cid}_${d.transaction_id ?? violation ?? d.kind ?? 'x'}_${amountMinor}`).set({ merchantId: uid, cardId: cid, kind: d.kind ?? null, amountMinor, violationCount: violation, cardTerminated: !!d.card_terminated, passedOn: r.charged || undefined, chargedUnits: r.units || undefined, at: Date.now() }, { merge: true });
      break;
    }
    case 'card.transaction': await cardRef(cid).set({ balanceMinor: Number.isFinite(Number(d.card_balance_minor)) ? Number(d.card_balance_minor) : null, updatedAt: Date.now() }, { merge: true }); break;
  }
  return 'ok';
}
