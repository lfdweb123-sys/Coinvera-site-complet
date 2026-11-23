import { db } from '../firebase-admin';
import { createWithdrawal, bybitConfigured } from '../bybit';
import { toUnits } from '../money';
import { info, warn, error } from '../log';
import { sendMail, esc } from '../brevo';
import { cardSettings } from './settings';
import { programme } from './wallet';
// Alimentation AUTOMATIQUE du portefeuille du programme depuis le compte Bybit de la plateforme (retrait USDT TRC20 vers l'adresse du programme).
// Déclenchée uniquement quand le prestataire refuse une commande payée par solde faute de fonds (rail_unfunded). Chaque commande a au plus UNE demande de retrait
// (clé d'idempotence stable : un rejeu ne peut jamais envoyer deux fois). Le montant couvre le coût de la commande + les frais de dépôt du programme (1,5 %) + les frais réseau,
// avec un minimum pour limiter les petits retraits, et des plafonds par retrait et par jour : au-delà, rien n'est envoyé et l'erreur est journalisée.
// Alerte e-mail (support + adresse de secours) quand l'alimentation automatique ne peut pas se faire : le virement Bybit se fait alors à la main. Une alerte par cause (et par jour pour les causes globales).
const ALERT_TO = () => [...new Set([process.env.SUPPORT_EMAIL, ...(process.env.REFILL_ALERT_EMAILS ?? 'gerardfreelancer123@gmail.com').split(',')].map(x => (x ?? '').trim()).filter(Boolean))];
export async function alertRefill(key: string, subject: string, lines: string[]) {
  try { await db.doc(`card_refill_alerts/${key}`).create({ at: Date.now(), subject }); } catch { return; }   // déjà envoyée
  if (!process.env.BREVO_API_KEY) { warn('cards.refill_alert_not_sent', { subject }); return; }
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:22px;color:#0B1220"><h2 style="margin:0 0 12px 0">${esc(subject)}</h2>${lines.map(l => `<p style="margin:0 0 8px 0">${esc(l)}</p>`).join('')}</div>`;
  for (const to of ALERT_TO()) await sendMail(to, subject, html).catch(e => warn('cards.refill_alert_failed', { to, message: (e as Error).message }));
}
const dayKey = () => new Date().toISOString().slice(0, 10);
const dayStart = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.getTime(); };
export async function refillForOrder(orderId: string, ciTotalUnits: number) {
  const s = await cardSettings(); if (!s.refillAuto) return;
  if (!bybitConfigured()) { error('cards.refill_not_configured', { orderId }); await alertRefill(`notconf_${dayKey()}`, 'Alimentation du portefeuille cartes : action manuelle requise', ['Le portefeuille du programme de cartes est vide et Bybit n\u2019est pas configuré sur le site.', 'Faites un virement USDT TRC20 depuis Bybit vers l\u2019adresse du programme (page Card Issuing de CryptoInfra).']); return; }
  const ref = db.doc(`card_refills/${orderId}`); const ex = (await ref.get()).data();
  if (ex && (ex.status === 'sent' || (ex.status === 'failed' && (ex.attempts ?? 1) >= 3) || Date.now() - (ex.updatedAt ?? 0) < 120_000)) return;
  const prog = await programme(); const address = prog.addresses.usdttrc20;
  if (!address) { error('cards.refill_no_address', { orderId }); await alertRefill(`noaddr_${dayKey()}`, 'Alimentation du portefeuille cartes : adresse du programme introuvable', ['Le site n\u2019a pas pu lire l\u2019adresse USDT TRC20 du programme chez CryptoInfra.', 'Alimentez le portefeuille à la main depuis la page Card Issuing.']); return; }
  const need = (ciTotalUnits / (1 - prog.bps / 10000)) / 1e6 + (prog.chargeUnits.usdttrc20 ?? 0) / 1e6 + s.refillBuffer;
  const amount = Math.min(Math.max(need, s.refillMin), s.refillMax);
  if (amount < need) { error('cards.refill_over_cap', { orderId, need, cap: s.refillMax }); await alertRefill(`cap_${orderId}`, 'Alimentation du portefeuille cartes : montant au-dessus du plafond', [`Commande ${orderId} : il faut environ ${need.toFixed(2)} USDT, le plafond automatique est ${s.refillMax}.`, `Adresse du programme : ${address}`]); return; }
  const today = (await db.collection('card_refills').where('createdAt', '>=', dayStart()).get()).docs.reduce((t, d) => t + (d.data().status === 'failed' ? 0 : Number(d.data().amount ?? 0)), 0);
  if (today + amount > s.refillDaily) { error('cards.refill_daily_cap', { orderId, today, amount, cap: s.refillDaily }); await alertRefill(`daily_${new Date().toISOString().slice(0, 10)}`, 'Alimentation du portefeuille cartes : plafond journalier atteint', [`Déjà ${today.toFixed(2)} USDT envoyés aujourd\u2019hui, plafond ${s.refillDaily}.`, `Adresse du programme : ${address}`]); return; }
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
    else { await ref.update({ status: 'failed', error: `bybit_${r.retCode}`, updatedAt: Date.now() }); await lock.set({ orderId, until: 0 }); await alertRefill(`refused_${orderId}_${attempts}`, 'Retrait Bybit refusé : faites le virement à la main', [`Le site a demandé un retrait de ${amt} USDT (TRC20) vers le portefeuille du programme de cartes, et Bybit l\u2019a refusé.`, `Raison : ${r.retMsg ?? ''} (code ${r.retCode}). Si c\u2019est un refus d\u2019IP, c\u2019est l\u2019IP de Vercel qui n\u2019est pas autorisée.`, `Faites un virement de ${amt} USDT, réseau TRON (TRC20), vers : ${address}`, `Commande carte concernée : ${orderId}`]); error('cards.refill_refused', { orderId, retCode: r.retCode, retMsg: r.retMsg }); }
  } catch (e) { await ref.update({ status: 'unknown', updatedAt: Date.now() }); await alertRefill(`unknown_${orderId}_${attempts}`, 'Retrait Bybit : état inconnu, à vérifier', [`La demande de retrait de ${amt} USDT (TRC20) vers le portefeuille du programme n\u2019a pas reçu de réponse claire (${(e as Error).message}).`, 'Vérifiez dans Bybit si le retrait existe avant de refaire un virement.', `Adresse du programme : ${address}`, `Commande carte concernée : ${orderId}`]); warn('cards.refill_unknown_state', { orderId, message: (e as Error).message }); }   // même requestId au prochain passage : pas de doublon
}
