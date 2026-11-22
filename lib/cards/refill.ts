import { db } from '../firebase-admin';
import { createWithdrawal } from '../bybit';
import { toUnits } from '../money';
import { info, warn, error } from '../log';
import { cardSettings } from './settings';
import { programme } from './wallet';
// Alimentation AUTOMATIQUE du portefeuille du programme depuis le compte Bybit de la plateforme (retrait USDT TRC20 vers l'adresse du programme).
// Déclenchée uniquement quand le prestataire refuse une commande payée par solde faute de fonds (rail_unfunded). Chaque commande a au plus UNE demande de retrait
// (clé d'idempotence stable : un rejeu ne peut jamais envoyer deux fois). Le montant couvre le coût de la commande + les frais de dépôt du programme (1,5 %) + les frais réseau,
// avec un minimum pour limiter les petits retraits, et des plafonds par retrait et par jour : au-delà, rien n'est envoyé et l'erreur est journalisée.
const dayStart = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.getTime(); };
export async function refillForOrder(orderId: string, ciTotalUnits: number) {
  const s = await cardSettings(); if (!s.refillAuto) return;
  if (!process.env.BYBIT_API_KEY || !process.env.BYBIT_API_SECRET || !process.env.BYBIT_BASE_URL) { error('cards.refill_not_configured', { orderId, hint: 'Variables BYBIT_* absentes : alimenter le portefeuille du programme à la main' }); return; }
  const ref = db.doc(`card_refills/${orderId}`); const ex = (await ref.get()).data();
  if (ex && (ex.status === 'sent' || (ex.status === 'failed' && (ex.attempts ?? 1) >= 3) || Date.now() - (ex.updatedAt ?? 0) < 120_000)) return;
  const prog = await programme(); const address = prog.addresses.usdttrc20;
  if (!address) { error('cards.refill_no_address', { orderId }); return; }
  const need = (ciTotalUnits / (1 - prog.bps / 10000)) / 1e6 + (prog.chargeUnits.usdttrc20 ?? 0) / 1e6 + s.refillBuffer;
  const amount = Math.min(Math.max(need, s.refillMin), s.refillMax);
  if (amount < need) { error('cards.refill_over_cap', { orderId, need, cap: s.refillMax }); return; }
  const today = (await db.collection('card_refills').where('createdAt', '>=', dayStart()).get()).docs.reduce((t, d) => t + (d.data().status === 'failed' ? 0 : Number(d.data().amount ?? 0)), 0);
  if (today + amount > s.refillDaily) { error('cards.refill_daily_cap', { orderId, today, amount, cap: s.refillDaily }); return; }
  // Un seul retrait à la fois : tant qu'un retrait est en route (20 min), les autres commandes attendent ; verrou posé dans une transaction (pas de course entre deux requêtes).
  const lock = db.doc('card_refill_lock/current');
  const got = await db.runTransaction(async tx => { const l = (await tx.get(lock)).data(); if (l && l.until > Date.now() && l.orderId !== orderId) return false; tx.set(lock, { orderId, until: Date.now() + 20 * 60_000 }); return true; });
  if (!got) return;
  const attempts = ex ? (ex.status === 'failed' ? (ex.attempts ?? 1) + 1 : ex.attempts ?? 1) : 1;
  const requestId = `cardfund_${orderId}_${attempts}`; const amt = (Math.ceil(amount * 100) / 100).toFixed(2);
  await ref.set({ orderId, amount: Number(amt), address, requestId, attempts, status: 'sending', createdAt: ex?.createdAt ?? Date.now(), updatedAt: Date.now() }, { merge: true });
  try {
    const r = await createWithdrawal({ coin: 'USDT', chain: 'TRX', address, amount: amt, requestId });
    if (r.retCode === 0) { await ref.update({ status: 'sent', bybitId: String(r.result?.id ?? ''), updatedAt: Date.now() }); info('cards.refill_sent', { orderId, amount: amt }); }
    else { await ref.update({ status: 'failed', error: `bybit_${r.retCode}`, updatedAt: Date.now() }); await lock.set({ orderId, until: 0 }); error('cards.refill_refused', { orderId, retCode: r.retCode, retMsg: r.retMsg }); }
  } catch (e) { await ref.update({ status: 'unknown', updatedAt: Date.now() }); warn('cards.refill_unknown_state', { orderId, message: (e as Error).message }); }   // même requestId au prochain passage : pas de doublon
}
