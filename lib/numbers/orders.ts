import { FieldValue } from 'firebase-admin/firestore';
import { HttpError } from '../auth';
import { notify } from '../audit';
import { liveRate } from '../fiat/rates';
import { db } from '../firebase-admin';
import { postEntry, readBal, writeBal } from '../ledger';
import { warn } from '../log';
import { getSettings } from '../settings';
import * as p5 from './fivesim';
import { extractCode, FivesimError, isService, P5Order, SERVICES } from './fivesim';
// Numéros WhatsApp / Telegram (vérification par SMS), payés uniquement avec le solde disponible, comme ProxNum.
//   Écritures en partie double :  réservation  available → fsim_reserved
//                                 code reçu    fsim_reserved → platform:revenue   (le prix n'est un revenu que si le code est livré)
//                                 aucun code   fsim_reserved → available          (annulation, délai dépassé, numéro refusé, échec d'achat : remboursement immédiat)
//   Cycle : reserved → waiting (numéro délivré) → received (code reçu) | failed (remboursé) ; review = achat d'issue incertaine, résolu en relisant l'historique 5sim.
//   Le montant reste réservé tant que le code n'est pas arrivé : il n'y a donc jamais de débit à rembourser a posteriori.
const MIN = 60_000, WAIT_MS = 15 * MIN, GRACE_MS = MIN, STUCK_MS = 3 * MIN, LOST_MS = 20 * MIN;
const col = 'fivesim_orders';
const oref = (id: string) => db.doc(`${col}/${id}`);
const digits = (s: string) => s.replace(/\D/g, '');
const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : 0);

export type NewOrder = { ref: string; service: string; country: string; operator?: string; reuse?: boolean; voice?: boolean; forwardingNumber?: string };
/** Prix : montant fixe en XOF (réglage), converti en USD au taux du jour ; arrondi au-dessus, jamais de perte sur l'arrondi. */
export async function quote() {
  const s = await getSettings(); const priceXof = num((s as any).numbersPriceXof) || 8500; const rate = await liveRate('XOF');
  return { priceXof, rate, chargeUnits: Math.ceil((priceXof * 1e6) / rate) };
}
export const publicError = (c: string): [number, string] => c === 'no_free_phones' ? [409, 'no_free_phones'] : c === 'reuse_unavailable' ? [409, 'reuse_unavailable'] : c === 'bad_request' ? [400, 'invalid_request'] : [503, 'numbers_unavailable'];
const REASON_TEXT: Record<string, string> = { user_cancel: 'Votre annulation a été acceptée', timeout: 'Aucun code n’est arrivé dans le délai', number_used: 'Le numéro a été signalé comme déjà utilisé', canceled: 'Le numéro a été annulé', banned: 'Le numéro a été refusé', purchase_not_found: 'L’achat n’a pas abouti' };

export function view(id: string, o: any) {
  const has = o.status === 'waiting' || o.status === 'received';
  return { id, kind: o.kind ?? 'buy', service: o.service, serviceName: SERVICES[o.service as keyof typeof SERVICES]?.label ?? o.service, country: o.country, countryName: o.countryName ?? o.country, iso: o.iso ?? '',
    operator: o.operator ?? 'any', providerOperator: has ? o.providerOperator ?? null : null, status: o.status, phone: has ? o.phone ?? null : null, code: o.code ?? null, smsText: o.smsText ?? null,
    expiresAt: o.status === 'waiting' ? o.expiresAt ?? null : null, priceXof: o.priceXof, priceUsd: (num(o.chargeUnits) / 1e6).toFixed(2), error: o.error ?? null, refunded: !!o.refunded,
    canReuse: o.status === 'received' && !!o.options?.reuse && !!o.phone, options: { reuse: !!o.options?.reuse, voice: !!o.options?.voice, forwarding: !!o.options?.forwardingNumber }, createdAt: o.requestedAt ?? 0 };
}

async function create(uid: string, i: NewOrder, kind: 'buy' | 'reuse', reuseNumber?: string) {
  const s = await getSettings(); if (!(s as any).numbersEnabled) throw new HttpError(503, 'numbers_disabled');
  if (!isService(i.service)) throw new HttpError(400, 'invalid_service');
  if (i.forwardingNumber && !/^\d{11}$/.test(i.forwardingNumber)) throw new HttpError(400, 'invalid_request');
  const id = `${uid}_${i.ref}`, ref = oref(id);
  const prior = await ref.get(); if (prior.exists) return view(id, prior.data());   // même référence = même commande : un double clic ne débite jamais deux fois
  const list = await p5.countries().catch(() => []); const c = list.find(x => x.slug === i.country);
  if (list.length && !c) throw new HttpError(400, 'invalid_country');
  const q = await quote(), now = Date.now();
  await db.runTransaction(async tx => {
    const cur = await tx.get(ref); if (cur.exists) return;
    const bal = await readBal(tx, uid); const avail = num(bal.available); if (avail < q.chargeUnits) throw new HttpError(402, 'insufficient_balance');
    postEntry(tx, `fs_reserve_${id}`, uid, 'numbers_reserve', [{ account: `merchant:${uid}:available`, dir: 'debit', amount: q.chargeUnits }, { account: `merchant:${uid}:fsim_reserved`, dir: 'credit', amount: q.chargeUnits }], { orderId: id });
    writeBal(tx, uid, { ...bal, available: avail - q.chargeUnits, fsim_reserved: num(bal.fsim_reserved) + q.chargeUnits });
    tx.create(ref, { merchantId: uid, kind, service: i.service, country: i.country, countryName: c?.name ?? i.country, iso: c?.iso ?? '', operator: i.operator || 'any', reuseNumber: reuseNumber ?? null,
      options: { reuse: !!i.reuse, voice: !!i.voice, forwardingNumber: i.forwardingNumber ?? null }, status: 'reserved', chargeUnits: q.chargeUnits, priceXof: q.priceXof, rate: q.rate, requestedAt: now, updatedAt: now, createdAt: FieldValue.serverTimestamp() });
  });
  return purchase(id);
}
export const createOrder = (uid: string, i: NewOrder) => create(uid, i, 'buy');

/** Rachat d'un numéro déjà utilisé (acheté avec « reuse »), au même prix : nouvelle commande, nouveau code. */
export async function reuseOrder(uid: string, sourceId: string, ref: string) {
  const s = await oref(sourceId).get(); const o = s.data();
  if (!o || o.merchantId !== uid) throw new HttpError(404, 'not_found'); if (o.status !== 'received' || !o.options?.reuse || !o.phone) throw new HttpError(409, 'reuse_unavailable');
  return create(uid, { ref, service: o.service, country: o.country, operator: o.operator, reuse: true, voice: !!o.options?.voice, forwardingNumber: o.options?.forwardingNumber ?? undefined }, 'reuse', digits(o.phone));
}

async function purchase(id: string) {
  const ref = oref(id); const o = (await ref.get()).data()!;
  try {
    const p = o.kind === 'reuse' ? await p5.reuse(SERVICES[o.service as keyof typeof SERVICES].product, o.reuseNumber)
      : await p5.buyActivation({ country: o.country, operator: o.operator, product: SERVICES[o.service as keyof typeof SERVICES].product, reuse: o.options?.reuse, voice: o.options?.voice, forwardingNumber: o.options?.forwardingNumber ?? undefined });
    await attach(id, p);
  } catch (e) {
    const fe = e instanceof FivesimError ? e : new FivesimError('provider_unavailable', false);
    if (!fe.definitive) { await ref.update({ status: 'review', error: fe.code, updatedAt: Date.now() }); warn('numbers.purchase_uncertain', { orderId: id, code: fe.code }); await reconcileReview(id).catch(() => {}); return view(id, (await ref.get()).data()); }
    await release(id, fe.code);
    if (['provider_balance', 'provider_rating', 'provider_unauthorized', 'provider_offline'].includes(fe.code)) warn('numbers.provider_problem', { orderId: id, code: fe.code });   // l'exploitant lit l'alerte dans les journaux
    const [status, code] = publicError(fe.code); throw new HttpError(status, code);
  }
  return view(id, (await ref.get()).data());
}

async function attach(id: string, p: P5Order) {
  await db.runTransaction(async tx => {
    const ref = oref(id); const s = await tx.get(ref); const o = s.data(); if (!o || !['reserved', 'review'].includes(o.status)) return;
    tx.update(ref, { status: 'waiting', providerId: p.id, phone: p.phone, providerOperator: p.operator ?? null, providerPrice: p.price, providerStatus: p.status, expiresAt: Date.parse(p.expires) || Date.now() + WAIT_MS, error: null, updatedAt: Date.now() });
  });
}

/** Remet le montant réservé sur le solde. Une seule fois par commande (statut vérifié dans la transaction, écriture comptable à identifiant unique). */
export async function release(id: string, reason: string) {
  let hadNumber = false, uid = '';
  const done = await db.runTransaction(async tx => {
    const ref = oref(id); const s = await tx.get(ref); const o = s.data(); if (!o || !['reserved', 'review', 'waiting'].includes(o.status)) return false;
    const bal = await readBal(tx, o.merchantId), c = num(o.chargeUnits); hadNumber = !!o.providerId; uid = o.merchantId;
    postEntry(tx, `fs_release_${id}`, o.merchantId, 'numbers_release', [{ account: `merchant:${o.merchantId}:fsim_reserved`, dir: 'debit', amount: c }, { account: `merchant:${o.merchantId}:available`, dir: 'credit', amount: c }], { orderId: id, reason });
    writeBal(tx, o.merchantId, { ...bal, fsim_reserved: num(bal.fsim_reserved) - c, available: num(bal.available) + c });
    tx.update(ref, { status: 'failed', error: reason, refunded: true, refundedAt: Date.now(), updatedAt: Date.now() }); return true;
  });
  if (done) await notify(uid, hadNumber ? 'Numéro remboursé' : 'Commande de numéro annulée', `${hadNumber ? (REASON_TEXT[reason] ?? 'La commande n’a pas abouti') + ' : le' : 'Votre achat n’a pas pu être effectué. Le'} montant a été remis sur votre solde.`).catch(() => {});
  return done;
}

/** Code reçu : le prix devient un revenu. Le règlement n'a lieu qu'une fois (statut « waiting » exigé). */
async function settle(id: string, code: string, text: string, p: P5Order) {
  const done = await db.runTransaction(async tx => {
    const ref = oref(id); const s = await tx.get(ref); const o = s.data(); if (!o || o.status !== 'waiting') return false;
    const bal = await readBal(tx, o.merchantId), c = num(o.chargeUnits);
    postEntry(tx, `fs_done_${id}`, o.merchantId, 'numbers_settle', [{ account: `merchant:${o.merchantId}:fsim_reserved`, dir: 'debit', amount: c }, { account: 'platform:revenue', dir: 'credit', amount: c }], { orderId: id });
    writeBal(tx, o.merchantId, { ...bal, fsim_reserved: num(bal.fsim_reserved) - c, fsim_spent: num(bal.fsim_spent) + c });
    tx.update(ref, { status: 'received', code, smsText: text, providerStatus: p.status, receivedAt: Date.now(), updatedAt: Date.now() }); return true;
  });
  if (done) await p5.finish(p.id).catch(() => {});   // clôture chez 5sim (documentation : « finish » après réception du code)
  return done;
}

/** Relit la commande chez 5sim et en tire les conséquences : code → règlement ; annulée / expirée / refusée → remboursement ; sinon on attend. */
export async function syncOrder(id: string) {
  const ref = oref(id); const o = (await ref.get()).data(); if (!o) return;
  if (o.status === 'review' || (o.status === 'reserved' && Date.now() - num(o.requestedAt) > STUCK_MS)) { await reconcileReview(id); return; }
  if (o.status !== 'waiting' || !o.providerId) return;
  let p: P5Order;
  try { p = await p5.check(o.providerId); } catch (e) { if (e instanceof FivesimError && e.code === 'order_not_found') await release(id, 'purchase_not_found'); return; }   // erreur réseau : on réessaiera
  const got = extractCode(p);
  if (got) { await settle(id, got.code, got.text, p); return; }
  if (p.status === 'CANCELED' || p.status === 'TIMEOUT' || p.status === 'BANNED') { await release(id, p.status === 'TIMEOUT' ? 'timeout' : p.status.toLowerCase()); return; }
  if (p.status !== o.providerStatus) await ref.update({ providerStatus: p.status, updatedAt: Date.now() });
  if (Date.now() > num(o.expiresAt) + GRACE_MS) {   // le délai est dépassé et 5sim n'a pas encore tranché : on annule nous-mêmes
    try { await p5.cancel(o.providerId); await release(id, 'timeout'); }
    catch (e) { if (e instanceof FivesimError && e.code === 'order_has_sms') await syncOrder(id); else if (e instanceof FivesimError && (e.code === 'order_expired' || e.code === 'order_not_found')) await release(id, 'timeout'); }
  }
}

/** Achat d'issue incertaine (délai dépassé, erreur 5xx) : on cherche la commande dans l'historique 5sim ; si elle n'y est pas après 20 min, tout achat éventuel a expiré et l'utilisateur est remboursé. */
export async function reconcileReview(id: string): Promise<'attached' | 'released' | 'pending' | 'skipped'> {
  const ref = oref(id); const o = (await ref.get()).data(); if (!o || !['review', 'reserved'].includes(o.status)) return 'skipped';
  const product = SERVICES[o.service as keyof typeof SERVICES]?.product; let list: P5Order[];
  try { list = await p5.recentOrders(30); } catch { return 'pending'; }
  for (const c of list) {
    if (c.product !== product || c.country !== o.country || Date.parse(c.created_at) < num(o.requestedAt) - MIN) continue;
    if (o.kind === 'reuse' && digits(c.phone) !== o.reuseNumber) continue;
    const taken = await db.collection(col).where('providerId', '==', c.id).limit(1).get(); if (!taken.empty) continue;
    await attach(id, c); return 'attached';
  }
  if (Date.now() - num(o.requestedAt) > LOST_MS) { await release(id, 'purchase_not_found'); return 'released'; }
  return 'pending';
}

const owned = async (uid: string, id: string) => { const o = (await oref(id).get()).data(); if (!o || o.merchantId !== uid) throw new HttpError(404, 'not_found'); return o; };
async function stop(uid: string, id: string, act: typeof p5.cancel, reason: string) {
  const o = await owned(uid, id);
  if (o.status !== 'waiting') { if (o.status === 'reserved' || o.status === 'review') throw new HttpError(409, 'order_pending'); return view(id, o); }
  try { await act(o.providerId); await release(id, reason); }
  catch (e) {
    if (!(e instanceof FivesimError)) throw e;
    if (e.code === 'order_has_sms') await syncOrder(id);                                              // le code est arrivé entre-temps : pas de remboursement, on le montre
    else if (e.code === 'order_expired' || e.code === 'order_not_found') await release(id, 'timeout');
    else throw new HttpError(503, 'numbers_unavailable');
  }
  return view(id, (await oref(id).get()).data());
}
/** Annulation par l'utilisateur (GET /user/cancel/{id}) : remboursement immédiat. Refusée par 5sim si un SMS est déjà arrivé. */
export const cancelOrder = (uid: string, id: string) => stop(uid, id, p5.cancel, 'user_cancel');
/** « Numéro déjà utilisé » (GET /user/ban/{id}) : le numéro est signalé à 5sim, l'utilisateur est remboursé. */
export const reportUsed = (uid: string, id: string) => stop(uid, id, p5.ban, 'number_used');

export async function getOrder(uid: string, id: string) { await owned(uid, id); await syncOrder(id); return view(id, (await oref(id).get()).data()); }

/** Filet de sécurité planifié (cron) : rembourse même si l'utilisateur a quitté la page. */
export async function sweep() {
  const out = { checked: 0, errors: 0 };
  for (const status of ['waiting', 'review', 'reserved']) {
    const s = await db.collection(col).where('status', '==', status).limit(200).get();
    for (const d of s.docs) { try { await syncOrder(d.id); out.checked++; } catch (e) { out.errors++; warn('numbers.sweep_error', { orderId: d.id, error: String((e as Error).message) }); } }
  }
  return out;
}
