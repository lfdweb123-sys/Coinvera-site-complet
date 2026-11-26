import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../firebase-admin';
import { HttpError } from '../auth';
import { postEntry, readBal, writeBal } from '../ledger';
import { fromUnits } from '../money';
import { notify } from '../audit';
import { error as logError, info, warn } from '../log';
import { codeOf, failure, isOk, px, PxError, underfunded } from './api';
import { chargeOf, costUnits, countryName, knownService, rentalCatalog, serviceName, virtualQuote } from './pricing';
// Commandes ProxNum payées uniquement avec le solde disponible. Même mécanique que les cartes :
//  1) RÉSERVATION dans le registre (disponible -> proxnum_reserved) AVANT tout appel au prestataire ;
//  2) achat chez ProxNum ; 3) succès = fonds dépensés (coût prestataire + marge), échec définitif = fonds rendus.
// Si l'issue d'un achat est INCERTAINE (délai dépassé, erreur 5xx), les fonds restent réservés (statut « review ») : le cron relit la source (voir reconcileReview), jamais de double débit ni de perte.
export type Kind = 'virtual' | 'rental' | 'extend';
const acct = (uid: string, a: string) => `merchant:${uid}:${a}`;
const REF = /^[A-Za-z0-9_-]{8,40}$/, SERVICE = /^[A-Za-z0-9_]{1,16}$/;
const ref = (id: string) => db.doc(`proxnum_orders/${id}`);
const now = () => Date.now();
const clip = (s: unknown, n: number) => String(s ?? '').slice(0, n);

// ---------- Registre ----------
async function reserve(uid: string, id: string, data: Record<string, any>) {
  const r = ref(id);
  return db.runTransaction(async tx => {
    if ((await tx.get(r)).exists) return false;                       // même référence client = même commande (double clic, rejeu réseau)
    const bal = await readBal(tx, uid), c = data.chargeUnits as number;
    if (c > bal.available) throw new HttpError(409, 'insufficient_balance');
    postEntry(tx, `px_reserve_${id}`, uid, 'proxnum_reserve', [{ account: acct(uid, 'available'), dir: 'debit', amount: c }, { account: acct(uid, 'proxnum_reserved'), dir: 'credit', amount: c }], { orderId: id });
    writeBal(tx, uid, { ...bal, available: bal.available - c, proxnum_reserved: (bal.proxnum_reserved ?? 0) + c });
    tx.create(r, { ...data, merchantId: uid, status: 'reserved', refunded: false, createdAt: FieldValue.serverTimestamp(), createdAtMs: now() });
    return true;
  });
}
// Succès : la réservation est soldée ; le coût réel revient à ProxNum (central:funds), l'écart est notre marge. Idempotent.
export async function settle(id: string, patch: Record<string, any> = {}, actualCost?: number) {
  let uid = '', kind = '';
  const ok = await db.runTransaction(async tx => {
    const o = (await tx.get(ref(id))).data(); if (!o || (o.status !== 'reserved' && o.status !== 'review')) return false;
    const bal = await readBal(tx, o.merchantId), charge = o.chargeUnits as number, cost = Math.min(charge, actualCost ?? o.costUnits); uid = o.merchantId; kind = o.kind;
    const lines: any[] = [{ account: acct(uid, 'proxnum_reserved'), dir: 'debit', amount: charge }, { account: 'central:funds', dir: 'credit', amount: cost }]; if (charge - cost > 0) lines.push({ account: 'platform:revenue', dir: 'credit', amount: charge - cost });
    postEntry(tx, `px_done_${id}`, uid, 'proxnum_done', lines, { orderId: id });
    writeBal(tx, uid, { ...bal, proxnum_reserved: (bal.proxnum_reserved ?? 0) - charge, proxnum_spent: (bal.proxnum_spent ?? 0) + charge });
    tx.update(ref(id), { ...patch, status: 'confirmed', costUnits: cost, updatedAtMs: now() }); return true;
  });
  if (ok) info('proxnum.order_confirmed', { orderId: id, merchantId: uid, kind });
  return ok;
}
// Échec définitif (rien n'a été débité chez ProxNum) : les fonds retournent au solde disponible. Idempotent.
export async function release(id: string, code: string) {
  let uid = '';
  const ok = await db.runTransaction(async tx => {
    const o = (await tx.get(ref(id))).data(); if (!o || (o.status !== 'reserved' && o.status !== 'review')) return false;
    const bal = await readBal(tx, o.merchantId), charge = o.chargeUnits as number; uid = o.merchantId;
    postEntry(tx, `px_release_${id}`, uid, 'proxnum_release', [{ account: acct(uid, 'proxnum_reserved'), dir: 'debit', amount: charge }, { account: acct(uid, 'available'), dir: 'credit', amount: charge }], { orderId: id });
    writeBal(tx, uid, { ...bal, available: bal.available + charge, proxnum_reserved: (bal.proxnum_reserved ?? 0) - charge });
    tx.update(ref(id), { status: 'failed', error: code, updatedAtMs: now() }); return true;
  });
  if (ok) { info('proxnum.order_released', { orderId: id, merchantId: uid, code }); await notify(uid, 'Commande numéro virtuel annulée', 'Votre achat n’a pas pu être effectué. Les fonds ont été remis sur votre solde.').catch(() => {}); }
  return ok;
}
// Remboursement d'une commande confirmée annulée chez ProxNum (annulation acceptée) : l'intégralité de ce que l'utilisateur a payé lui revient, marge comprise. Idempotent.
export async function refund(id: string) {
  let uid = '';
  const ok = await db.runTransaction(async tx => {
    const o = (await tx.get(ref(id))).data(); if (!o || o.status !== 'confirmed' || o.refunded) return false;
    const bal = await readBal(tx, o.merchantId), charge = o.chargeUnits as number, cost = Math.min(charge, o.costUnits ?? charge); uid = o.merchantId;
    const lines: any[] = [{ account: 'central:funds', dir: 'debit', amount: cost }, { account: acct(uid, 'available'), dir: 'credit', amount: charge }]; if (charge - cost > 0) lines.push({ account: 'platform:revenue', dir: 'debit', amount: charge - cost });
    postEntry(tx, `px_refund_${id}`, uid, 'proxnum_refund', lines, { orderId: id });
    writeBal(tx, uid, { ...bal, available: bal.available + charge, proxnum_spent: Math.max(0, (bal.proxnum_spent ?? 0) - charge) });
    tx.update(ref(id), { refunded: true, cancel: 'done', refundedAtMs: now(), updatedAtMs: now() }); return true;
  });
  if (ok) { info('proxnum.order_refunded', { orderId: id, merchantId: uid }); await notify(uid, 'Numéro virtuel remboursé', 'Votre annulation a été acceptée : le montant a été remis sur votre solde.').catch(() => {}); }
  return ok;
}
const review = async (id: string, why: string) => { await ref(id).update({ status: 'review', reviewReason: why, updatedAtMs: now() }); logError('proxnum.order_review', { orderId: id, why }); };
// Échec d'un appel de service : alerte l'exploitant si le solde revendeur est vide, puis libère les fonds.
async function fail(id: string, e: unknown) {
  const code = e instanceof HttpError ? e.code : 'provider_unreachable'; if (underfunded(code)) logError('proxnum.provider_underfunded', { orderId: id });
  await release(id, code === 'insufficient_balance' || code === 'insufficient_funds' ? 'service_unavailable' : code);
}

// ---------- Vue envoyée au navigateur (aucun identifiant ni nom du prestataire) ----------
export const view = (id: string, o: Record<string, any>) => ({ id, kind: o.kind as Kind, status: o.status as string, service: o.service ?? null, serviceName: o.service ? serviceName(o.service) : null, country: o.country ?? null, countryName: o.country != null ? countryName(String(o.country), o.countryName) : null,
  hours: o.hours ?? null, phone: o.phone ?? null, code: o.code ?? null, providerStatus: o.providerStatus ?? null, total: fromUnits(o.chargeUnits ?? 0), refunded: !!o.refunded, cancel: o.cancel ?? 'none', error: o.error ?? null,
  expiresAt: o.expiresAt ?? null, cancelUntil: o.cancelUntil ?? null, canCancel: !!o.canCancel, canExtend: !!o.canExtend, messages: o.messages ?? [], parentId: o.parentId ?? null, createdAt: o.createdAtMs ?? null });
async function own(uid: string, id: string) {
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) throw new HttpError(404, 'not_found');
  const o = (await ref(id).get()).data(); if (!o || o.merchantId !== uid) throw new HttpError(404, 'not_found'); return o;
}
const idFor = (uid: string, r: string) => { if (!REF.test(r)) throw new HttpError(400, 'invalid_request'); return `${uid}_${r}`; };
const checkPrice = (expected: number | undefined, charge: number) => { if (expected !== undefined && charge > expected) throw new HttpError(409, 'price_changed'); };

// ---------- Numéro virtuel (activation unique) ----------
export async function buyVirtual(uid: string, p: { ref: string; service: string; country: number; token?: string; expected?: number }) {
  if (!SERVICE.test(p.service) || !knownService(p.service) || !Number.isInteger(p.country) || p.country < 0) throw new HttpError(400, 'invalid_request');
  const id = idFor(uid, p.ref); const q = await virtualQuote(p.service, p.country, p.token);   // prix reverifié ICI, côté serveur
  checkPrice(p.expected, q.chargeUnits);
  const created = await reserve(uid, id, { kind: 'virtual', service: p.service, country: String(p.country), priceToken: q.token ?? null, costUnits: q.costUnits, chargeUnits: q.chargeUnits, markupUnits: q.chargeUnits - q.costUnits });
  if (created) await dispatchVirtual(id);
  return view(id, (await ref(id).get()).data()!);
}
async function dispatchVirtual(id: string) {
  const o = (await ref(id).get()).data(); if (!o || o.status !== 'reserved') return;
  try {
    const r = await px('POST', '/resell/virtual/buy', { body: { service: o.service, country: Number(o.country), ...(o.priceToken ? { price_token: o.priceToken } : {}) } });
    const a = r.j?.activation;
    if (isOk(r) && a?.activation_id != null) await settle(id, { activationId: String(a.activation_id), phone: clip(a.phone, 32), providerStatus: clip(a.msg, 60), canCancel: true }, a.amount_paid != null ? costUnits(a.amount_paid) : undefined);
    else await fail(id, failure(r));
  } catch (e) { if (e instanceof PxError && e.ambiguous) await review(id, 'virtual_buy_unknown'); else await fail(id, e); }
}
// Interroge ProxNum et met à jour le code reçu. Les locations sont lues de la même façon (SMS reçus, statut, expiration).
export async function refreshOrder(uid: string, id: string) {
  const o = await own(uid, id);
  if (o.status !== 'confirmed' || o.refunded || now() - (o.checkedMs ?? 0) < 3000) return view(id, o);   // au plus une lecture toutes les 3 s par commande
  const patch: Record<string, any> = { checkedMs: now() };
  try {
    if (o.kind === 'virtual' && !o.code && o.activationId) {
      const r = await px('GET', `/resell/virtual/${encodeURIComponent(o.activationId)}/status`);
      if (isOk(r)) { patch.providerStatus = clip(r.j.status, 60); if (r.j.code) patch.code = clip(r.j.code, 32); }
    } else if (o.kind === 'rental' && o.rentalId != null) {
      const r = await px('GET', `/resell/rental/${encodeURIComponent(String(o.rentalId))}/status`);
      if (isOk(r) && r.j.rental) {
        const x = r.j.rental; Object.assign(patch, { providerStatus: clip(x.status, 30), expiresAt: x.expires_at ?? o.expiresAt ?? null, canCancel: !!x.can_cancel, canExtend: !!x.can_extend,
          messages: (Array.isArray(x.messages) ? x.messages : []).slice(0, 50).map((m: any) => ({ sender: clip(m.sender, 60), text: clip(m.text, 300), code: m.code ? clip(m.code, 32) : null, date: clip(m.date, 40) })) });
        if (x.status === 'cancelling') patch.cancel = 'pending';
      }
    }
  } catch (e) { if (!(e instanceof PxError)) throw e; }                                            // ProxNum injoignable : on garde la dernière valeur connue
  await ref(id).update(patch); if (patch.providerStatus === 'cancelled' && o.kind === 'rental') await refund(id);   // annulation confirmée par ProxNum : remboursement (une seule fois)
  return view(id, (await ref(id).get()).data()!);
}
// Annulation d'un numéro virtuel : ProxNum juge si l'activation est remboursable ; on ne rembourse QUE sur « cancel_accepted ».
export async function cancelOrder(uid: string, id: string) {
  const o = await own(uid, id); if (o.status !== 'confirmed' || o.refunded || o.kind === 'extend') throw new HttpError(409, 'order_state');
  if (o.kind === 'virtual') {
    if (o.code) throw new HttpError(409, 'cancel_rejected');
    const r = await px('POST', '/resell/virtual/cancel', { body: { activation_id: o.activationId } });
    if (r.j?.success === true && r.j?.code === 'cancel_accepted') await refund(id);
    else { const c = codeOf(r); throw new HttpError(409, c === 'cancel_rejected' ? c : 'cancel_rejected'); }
  } else {
    if (o.cancel === 'pending') throw new HttpError(409, 'cancel_pending');
    const r = await px('POST', '/resell/rental/cancel', { body: { id: o.rentalId } });
    if (r.status === 202 && r.j?.ok && r.j?.pending) await ref(id).update({ cancel: 'pending', updatedAtMs: now() });   // remboursement à la confirmation de ProxNum
    else if (r.status === 200 && r.j?.ok && r.j?.pending === false) await refund(id);
    else throw new HttpError(409, ['window_closed', 'sms_received', 'extended', 'cancel_pending', 'not_active'].includes(codeOf(r)) ? codeOf(r) : 'order_state');
  }
  return view(id, (await ref(id).get()).data()!);
}
// Renvoi / réactivation du SMS (POST /resell/virtual/resend) : ProxNum crée une nouvelle activation, suivie à la place de l'ancienne sur la même commande.
export async function resendOrder(uid: string, id: string) {
  const o = await own(uid, id); if (o.kind !== 'virtual' || o.status !== 'confirmed' || o.refunded || o.code) throw new HttpError(409, 'order_state');
  const r = await px('POST', '/resell/virtual/resend', { body: { activation_id: o.activationId } }); const a = r.j?.activation;
  if (!isOk(r) || a?.activation_id == null) throw failure(r);
  await ref(id).update({ activationId: String(a.activation_id), phone: clip(a.phone ?? o.phone, 32), previousActivations: FieldValue.arrayUnion(o.activationId), providerStatus: 'resent', updatedAtMs: now() });
  return view(id, (await ref(id).get()).data()!);
}

// ---------- Location ----------
export async function buyRental(uid: string, p: { ref: string; service: string; country: number; hours: number; expected?: number }) {
  if (!SERVICE.test(p.service) || !Number.isInteger(p.country) || p.country < 0 || !Number.isInteger(p.hours) || p.hours <= 0) throw new HttpError(400, 'invalid_request');
  const id = idFor(uid, p.ref); const cat = await rentalCatalog(String(p.country), p.hours);
  if (!cat.durations.some((d: any) => d.hours === p.hours)) throw new HttpError(422, 'invalid_period');                  // hours doit venir de durations[]
  const s = cat.services.find((x: any) => x.code === p.service); if (!s || s.stock <= 0) throw new HttpError(409, 'no_numbers');
  const charge = chargeOf(s.costUnits); checkPrice(p.expected, charge);
  const cname = cat.countries.find((c: any) => c.id === String(p.country))?.name;
  const created = await reserve(uid, id, { kind: 'rental', service: p.service, country: String(p.country), countryName: cname ?? null, hours: p.hours, costUnits: s.costUnits, providerPrice: s.providerPrice, chargeUnits: charge, markupUnits: charge - s.costUnits });
  if (created) await dispatchRental(id);
  return view(id, (await ref(id).get()).data()!);
}
async function dispatchRental(id: string) {
  const o = (await ref(id).get()).data(); if (!o || o.status !== 'reserved') return;
  try {
    // max_price : ProxNum ne débite rien si son prix a dépassé celui que nous venons de lire (erreur price_changed).
    const r = await px('POST', '/resell/rental/buy', { body: { service: o.service, country: Number(o.country), hours: o.hours, max_price: o.providerPrice } }); const x = r.j?.rental;
    if (isOk(r) && x?.id != null) await settle(id, { rentalId: String(x.id), phone: clip(x.phone, 32), providerStatus: clip(x.status, 30), expiresAt: x.expires_at ?? null, cancelUntil: x.cancel_until ?? null, canCancel: !!x.can_cancel, canExtend: !!x.can_extend }, x.amount_paid != null ? costUnits(x.amount_paid) : undefined);
    else await fail(id, failure(r));
  } catch (e) { if (e instanceof PxError && e.ambiguous) await review(id, 'rental_buy_unknown'); else await fail(id, e); }
}
// Options de prolongation (prix lus en temps réel pour ce numéro précis), avec notre marge.
export async function extendOptions(uid: string, id: string) {
  const o = await own(uid, id); if (o.kind !== 'rental' || o.status !== 'confirmed' || o.refunded) throw new HttpError(409, 'order_state');
  const r = await px('GET', `/resell/rental/${encodeURIComponent(String(o.rentalId))}/extend-options`); if (!isOk(r)) throw failure(r);
  return (r.j.options ?? []).filter((x: any) => Number(x?.price) > 0).map((x: any) => ({ hours: Number(x.hours), label: String(x.label ?? `${x.hours} h`), price: fromUnits(chargeOf(costUnits(x.price))) }));
}
export async function extendRental(uid: string, parentId: string, p: { ref: string; hours: number; expected?: number }) {
  const par = await own(uid, parentId); if (par.kind !== 'rental' || par.status !== 'confirmed' || par.refunded || par.cancel === 'pending' || !Number.isInteger(p.hours) || p.hours <= 0) throw new HttpError(409, 'order_state');
  const id = idFor(uid, p.ref); const r = await px('GET', `/resell/rental/${encodeURIComponent(String(par.rentalId))}/extend-options`); if (!isOk(r)) throw failure(r);
  const opt = (r.j.options ?? []).find((x: any) => Number(x.hours) === p.hours); if (!opt) throw new HttpError(422, 'invalid_period');
  const cost = costUnits(opt.price), charge = chargeOf(cost); checkPrice(p.expected, charge);
  const created = await reserve(uid, id, { kind: 'extend', parentId, service: par.service, country: par.country, hours: p.hours, rentalId: par.rentalId, prevExpiresAt: par.expiresAt ?? null, costUnits: cost, providerPrice: Number(opt.price), chargeUnits: charge, markupUnits: charge - cost });
  if (created) await dispatchExtend(id);
  return view(id, (await ref(id).get()).data()!);
}
async function applyExtension(id: string, o: Record<string, any>, expiresAt: string | null) {
  if (await settle(id, { expiresAt, providerStatus: 'extended' })) await ref(o.parentId).update({ expiresAt, extended: true, canCancel: false, cancelUntil: null, updatedAtMs: now() });   // une location prolongée ne peut plus être annulée
}
async function dispatchExtend(id: string) {
  const o = (await ref(id).get()).data(); if (!o || o.status !== 'reserved') return;
  try {
    const r = await px('POST', `/resell/rental/${encodeURIComponent(String(o.rentalId))}/extend`, { body: { hours: o.hours, max_price: o.providerPrice } });
    if (isOk(r)) await applyExtension(id, o, r.j.rental?.expires_at ?? null); else await fail(id, failure(r));
  } catch (e) { if (e instanceof PxError && e.ambiguous) await review(id, 'extend_unknown'); else await fail(id, e); }
}

// ---------- Rapprochement (cron) : la source de vérité est ProxNum ----------
const REVIEW_GRACE_MS = 30 * 60_000;
const rows = (r: any): any[] => Array.isArray(r.j) ? r.j : Array.isArray(r.j?.data) ? r.j.data : Array.isArray(r.j?.activations) ? r.j.activations : [];
const claimed = async (field: 'activationId' | 'rentalId', v: string) => !(await db.collection('proxnum_orders').where(field, '==', v).limit(1).get()).empty;
export async function reconcileReview(id: string) {
  const o = (await ref(id).get()).data(); if (!o || o.status !== 'review') return;
  const age = now() - (o.createdAtMs ?? 0);
  try {
    if (o.kind === 'extend') {                                                                       // la location a-t-elle réellement été prolongée ?
      const r = await px('GET', `/resell/rental/${encodeURIComponent(String(o.rentalId))}/status`); const exp = r.j?.rental?.expires_at;
      if (isOk(r) && exp && exp !== o.prevExpiresAt) await applyExtension(id, o, exp); else if (isOk(r) && age > REVIEW_GRACE_MS) await release(id, 'provider_unreachable');
      return;
    }
    const v = o.kind === 'virtual', r = await px('GET', v ? '/resell/activations' : '/resell/rentals', { query: { page: 1, per_page: 50 } }); if (r.status >= 400) return;
    // Un achat peut avoir été exécuté : on cherche, dans les achats récents, un achat du même montant que Coinvera n'a attribué à personne.
    const cands: any[] = []; for (const it of rows(r)) { const pid = String(v ? it.activation_id ?? '' : it.id ?? ''); if (!pid || Math.abs(Number(it.amount_paid) - o.costUnits / 1e6) > 0.0001 || (!v && it.service && it.service !== o.service)) continue; if (!(await claimed(v ? 'activationId' : 'rentalId', pid))) cands.push(it); }
    if (!cands.length && age > REVIEW_GRACE_MS) { await release(id, 'provider_unreachable'); return; }   // rien n'a été débité chez ProxNum : fonds rendus
    if (cands.length) logError('proxnum.review_manual', { orderId: id, kind: o.kind, candidates: cands.length });   // achat probablement exécuté : on ne l'attribue jamais automatiquement (risque d'erreur d'attribution entre clients) ; les fonds restent réservés pour vérification manuelle
  } catch (e) { if (!(e instanceof PxError)) throw e; warn('proxnum.reconcile_retry', { orderId: id, code: (e as PxError).code }); }
}
// Annulations de location « en attente » : remboursement dès que ProxNum confirme (status = cancelled), ou retour à l'état actif si l'annulation est refusée.
export async function reconcilePendingCancel(id: string) {
  const o = (await ref(id).get()).data(); if (!o || o.kind !== 'rental' || o.cancel !== 'pending' || o.refunded) return;
  const r = await px('GET', `/resell/rental/${encodeURIComponent(String(o.rentalId))}/status`); const s = r.j?.rental?.status; if (!isOk(r) || !s) return;
  if (s === 'cancelled') await refund(id); else if (s === 'active' || s === 'expired') await ref(id).update({ cancel: 'none', providerStatus: s, updatedAtMs: now() });
}
// Commandes restées « reserved » (arrêt du serveur entre la réservation et l'appel) : l'issue est inconnue, elles passent en « review » où la source (ProxNum) tranche.
export async function reconcileStalled(id: string) {
  const o = (await ref(id).get()).data(); if (!o || o.status !== 'reserved' || now() - (o.createdAtMs ?? 0) < 3 * 60_000) return;
  await review(id, 'stalled');
}
