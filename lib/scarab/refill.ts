import { db } from '../firebase-admin';
import { createWithdrawal, bybitConfigured } from '../bybit';
import { info, warn, error } from '../log';
import { cardSettings } from '../cards/settings';
import { alertRefill } from '../cards/refill';
import { wallet } from './catalog';
import { scarabSettings } from './settings';
import { depositAddresses, depositRate } from './pay';
// Alimentation AUTOMATIQUE du portefeuille de la Virtuals cards pro depuis le compte Bybit (retrait USDT TRC20 vers l'adresse de dépôt du prestataire), avec alerte e-mail.
// Déclenchée par le cron (niveau bas) et dès qu'un devis échoue faute de fonds. Mêmes plafonds que l'alimentation des cartes standard (Admin > réglages cartes : refillMin / refillMax / refillDaily).
// Garde-fous : un seul retrait en route à la fois (verrou 30 min, le dépôt met du temps à arriver), plafond par retrait et par jour, identifiant de retrait stable (jamais de doublon), et une alerte e-mail
// (une par cause et par jour) dès que l'alimentation automatique ne peut pas se faire : le virement se fait alors à la main.
export const LOW_USD = 60;   // sous ce niveau, on réalimente
const dayKey = () => new Date().toISOString().slice(0, 10);
export async function ensureScarabFunds(needUsd = 0) {
  if (!(await scarabSettings()).enabled) return;                                 // service fermé : rien à alimenter
  const w = await wallet(true).catch(() => null); if (!w) return; const have = w.availableMinor / 100;
  if (have >= Math.max(LOW_USD, needUsd)) return;
  const s = await cardSettings();
  const lowAlert = (why: string, lines: string[]) => alertRefill(`scarab_${why}_${dayKey()}`, 'Virtuals cards pro : portefeuille bas, action manuelle requise', [`Solde du portefeuille chez le prestataire : ${have.toFixed(2)} $ (seuil ${LOW_USD} $).`, ...lines]);
  if (!s.refillAuto) return void await lowAlert('off', ['L’alimentation automatique est désactivée : faites un virement USDT depuis Bybit vers l’adresse de dépôt du prestataire (page Deposit).']);
  if (!bybitConfigured()) return void await lowAlert('notconf', ['Bybit n’est pas configuré sur le site : faites un virement USDT TRC20 depuis Bybit vers l’adresse de dépôt du prestataire.']);
  const address = (await depositAddresses()).usdttrc20; if (!address) return void await lowAlert('noaddr', ['Adresse de dépôt USDT TRC20 du prestataire introuvable : alimentez le portefeuille à la main (page Deposit).']);
  const rate = await depositRate().catch(() => 0.995);
  const gap = Math.max(LOW_USD * 3, needUsd * 2) - have;                         // on remonte à ~3 fois le seuil
  const amount = Math.min(Math.max(gap / rate + s.refillBuffer, s.refillMin), s.refillMax); const amt = (Math.ceil(amount * 100) / 100).toFixed(2);
  const today = (await db.collection('scarab_refills').where('createdAt', '>=', new Date(dayKey()).getTime()).get()).docs.reduce((t, d) => t + (d.data().status === 'failed' ? 0 : Number(d.data().amount ?? 0)), 0);
  if (today + Number(amt) > s.refillDaily) return void await lowAlert('daily', [`Plafond journalier atteint (${today.toFixed(2)} USDT déjà envoyés aujourd’hui, plafond ${s.refillDaily}).`, `Adresse de dépôt : ${address}`]);
  const lock = db.doc('scarab_refill_lock/current'); const slot = Date.now();
  const got = await db.runTransaction(async tx => { const l = (await tx.get(lock)).data(); if (l && l.until > slot) return false; tx.set(lock, { until: slot + 30 * 60_000, at: slot }); return true; });
  if (!got) return;                                                              // un retrait est déjà en route
  const requestId = `scarabfund_${slot}`; const ref = db.doc(`scarab_refills/${requestId}`);
  await ref.set({ amount: Number(amt), address, requestId, status: 'sending', createdAt: slot, have });
  try {
    const r = await createWithdrawal({ coin: 'USDT', chain: 'TRX', address, amount: amt, requestId });
    if (r.retCode === 0) { await ref.update({ status: 'sent', bybitId: String(r.result?.id ?? '') }); info('scarab.refill_sent', { amount: amt }); }
    else { await ref.update({ status: 'failed', error: `bybit_${r.retCode}` }); await lock.set({ until: 0, at: slot }); error('scarab.refill_refused', { retCode: r.retCode, retMsg: r.retMsg });
      await alertRefill(`scarab_refused_${slot}`, 'Retrait Bybit refusé (Virtuals cards pro) : faites le virement à la main', [`Le site a demandé ${amt} USDT (TRC20) vers le portefeuille de la carte pro et Bybit l’a refusé : ${r.retMsg ?? ''} (code ${r.retCode}).`, `Faites un virement de ${amt} USDT, réseau TRON (TRC20), vers : ${address}`]); }
  } catch (e) { await ref.update({ status: 'unknown' }); warn('scarab.refill_unknown_state', { message: (e as Error).message });
    await alertRefill(`scarab_unknown_${slot}`, 'Retrait Bybit (Virtuals cards pro) : état inconnu, à vérifier', [`La demande de ${amt} USDT (TRC20) n’a pas reçu de réponse claire (${(e as Error).message}).`, 'Vérifiez dans Bybit si le retrait existe avant de refaire un virement.', `Adresse de dépôt : ${address}`]); }
}
