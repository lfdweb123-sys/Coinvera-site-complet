import crypto from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../firebase-admin';
import { HttpError } from '../auth';
import { postEntry, readBal, writeBal } from '../ledger';
import { fromUnits } from '../money';
import { notify } from '../audit';
import { error as logError, info, warn } from '../log';
import { AMBIGUOUS, codeOf, es, EsError, failure, isOk, underfunded } from './api';
import { daysLabel, gbLabel, norm } from './format';
import { freshPlan, nameOf } from './pricing';
// Commandes eSIM payées uniquement avec le solde disponible. Même mécanique que les numéros virtuels et les cartes :
//  1) RÉSERVATION dans le registre (disponible -> esim_reserved) AVANT tout appel au prestataire ;
//  2) commande chez eSIM Access (« ordered »), puis récupération du profil (QR code, code d'activation) : succès = fonds dépensés (coût prestataire + marge), échec définitif = fonds rendus ;
//  3) annulation d'une eSIM jamais installée = remboursement intégral, une seule fois.
// Si l'issue d'une commande est INCERTAINE (délai dépassé, erreur serveur), les fonds restent réservés (statut « review ») : le cron relit la source (voir reconcileReview). L'identifiant de transaction envoyé au prestataire est
// déterministe : un renvoi ne peut jamais créer une deuxième commande. Jamais de double débit ni de perte.
const acct = (uid: string, a: string) => `merchant:${uid}:${a}`;
const REF = /^[A-Za-z0-9_-]{8,40}$/, SLUG = /^[A-Za-z0-9_.\-]{1,64}$/;
const ref = (id: string) => db.doc(`esim_orders/${id}`);
const now = () => Date.now();
const clip = (s: unknown, n: number) => String(s ?? '').slice(0, n);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const idFor = (uid: string, r: string) => { if (!REF.test(r)) throw new HttpError(400, 'invalid_request'); return `${uid}_${r}`; };
const txnOf = (id: string) => 'cv' + crypto.createHash('sha256').update(id).digest('hex').slice(0, 40);   // 42 caractères (50 max chez le prestataire)
const checkPrice = (expected: number | undefined, charge: number) => { if (expected !== undefined && charge > expected) throw new HttpError(409, 'price_changed'); };
const TERMINAL = new Set(['USED_EXPIRED', 'UNUSED_EXPIRED', 'CANCEL', 'REVOKE', 'REVOKED']);

// ---------- Registre ----------
async function reserve(uid: string, id: string, data: Record<string, any>) {
  const r = ref(id);
  return db.runTransaction(async tx => {
    if ((await tx.get(r)).exists) return false;                       // même référence client = même commande (double clic, rejeu réseau)
    const bal = await readBal(tx, uid), c = data.chargeUnits as number;
    if (c > bal.available) throw new HttpError(409, 'insufficient_balance');
    postEntry(tx, `es_reserve_${id}`, uid, 'esim_reserve', [{ account: acct(uid, 'available'), dir: 'debit', amount: c }, { account: acct(uid, 'esim_reserved'), dir: 'credit', amount: c }], { orderId: id });
    writeBal(tx, uid, { ...bal, available: bal.available - c, esim_reserved: (bal.esim_reserved ?? 0) + c });
    tx.create(r, { ...data, merchantId: uid, status: 'reserved', refunded: false, createdAt: FieldValue.serverTimestamp(), createdAtMs: now() });
    return true;
  });
}
// Succès : la réservation est soldée ; le coût réel revient à eSIM Access (central:funds), l'écart est notre marge. Idempotent.
export async function settle(id: string, patch: Record<string, any> = {}) {
  let uid = '', title = '';
  const ok = await db.runTransaction(async tx => {
    const o = (await tx.get(ref(id))).data(); if (!o || !['reserved', 'ordered', 'review'].includes(o.status)) return false;
    const bal = await readBal(tx, o.merchantId), charge = o.chargeUnits as number, cost = Math.min(charge, o.costUnits as number); uid = o.merchantId; title = o.title;
    const lines: any[] = [{ account: acct(uid, 'esim_reserved'), dir: 'debit', amount: charge }, { account: 'central:funds', dir: 'credit', amount: cost }]; if (charge - cost > 0) lines.push({ account: 'platform:revenue', dir: 'credit', amount: charge - cost });
    postEntry(tx, `es_done_${id}`, uid, 'esim_done', lines, { orderId: id });
    writeBal(tx, uid, { ...bal, esim_reserved: (bal.esim_reserved ?? 0) - charge, esim_spent: (bal.esim_spent ?? 0) + charge });
    tx.update(ref(id), { ...patch, status: 'confirmed', updatedAtMs: now() }); return true;
  });
  if (ok) { info('esim.order_confirmed', { orderId: id, merchantId: uid }); await notify(uid, 'Votre eSIM est prête', `Votre eSIM « ${title} » est disponible dans votre espace : scannez son QR code pour l’installer.`).catch(() => {}); }
  return ok;
}
// Échec définitif (rien n'a été débité chez le prestataire) : les fonds retournent au solde disponible. Idempotent.
export async function release(id: string, code: string) {
  let uid = '';
  const ok = await db.runTransaction(async tx => {
    const o = (await tx.get(ref(id))).data(); if (!o || !['reserved', 'ordered', 'review'].includes(o.status)) return false;
    const bal = await readBal(tx, o.merchantId), charge = o.chargeUnits as number; uid = o.merchantId;
    postEntry(tx, `es_release_${id}`, uid, 'esim_release', [{ account: acct(uid, 'esim_reserved'), dir: 'debit', amount: charge }, { account: acct(uid, 'available'), dir: 'credit', amount: charge }], { orderId: id });
    writeBal(tx, uid, { ...bal, available: bal.available + charge, esim_reserved: (bal.esim_reserved ?? 0) - charge });
    tx.update(ref(id), { status: 'failed', error: code, updatedAtMs: now() }); return true;
  });
  if (ok) { info('esim.order_released', { orderId: id, merchantId: uid, code }); await notify(uid, 'Commande eSIM annulée', 'Votre achat n’a pas pu être effectué. Les fonds ont été remis sur votre solde.').catch(() => {}); }
  return ok;
}
// Remboursement d'une eSIM confirmée puis annulée chez eSIM Access (jamais installée) : l'intégralité de ce que l'utilisateur a payé lui revient, marge comprise. Idempotent.
export async function refund(id: string) {
  let uid = '';
  const ok = await db.runTransaction(async tx => {
    const o = (await tx.get(ref(id))).data(); if (!o || o.status !== 'confirmed' || o.refunded) return false;
    const bal = await readBal(tx, o.merchantId), charge = o.chargeUnits as number, cost = Math.min(charge, o.costUnits ?? charge); uid = o.merchantId;
    const lines: any[] = [{ account: 'central:funds', dir: 'debit', amount: cost }, { account: acct(uid, 'available'), dir: 'credit', amount: charge }]; if (charge - cost > 0) lines.push({ account: 'platform:revenue', dir: 'debit', amount: charge - cost });
    postEntry(tx, `es_refund_${id}`, uid, 'esim_refund', lines, { orderId: id });
    writeBal(tx, uid, { ...bal, available: bal.available + charge, esim_spent: Math.max(0, (bal.esim_spent ?? 0) - charge) });
    tx.update(ref(id), { refunded: true, refundedAtMs: now(), updatedAtMs: now(), esim: { ...(o.esim ?? {}), esimStatus: 'CANCEL' } }); return true;
  });
  if (ok) { info('esim.order_refunded', { orderId: id, merchantId: uid }); await notify(uid, 'eSIM remboursée', 'Votre annulation a été acceptée : le montant a été remis sur votre solde.').catch(() => {}); }
  return ok;
}
const review = async (id: string, why: string) => { await ref(id).update({ status: 'review', reviewReason: why, updatedAtMs: now() }); logError('esim.order_review', { orderId: id, why }); };
// Échec d'un appel : alerte l'exploitant si le solde revendeur est vide, puis libère les fonds.
async function fail(id: string, e: unknown, providerCode?: string) {
  const code = e instanceof HttpError ? e.code : 'provider_unreachable'; if (providerCode && underfunded(providerCode)) logError('esim.provider_underfunded', { orderId: id });
  await release(id, code);
}

// ---------- États et vues ----------
export const canCancel = (o: Record<string, any>) => o.status === 'confirmed' && !o.refunded && o.esim?.esimStatus === 'GOT_RESOURCE' && o.esim?.smdpStatus === 'RELEASED';   // jamais installée
export function stateOf(o: Record<string, any>): string {
  if (o.status === 'failed') return 'failed'; if (o.status === 'review') return 'review'; if (o.status !== 'confirmed') return 'preparing'; if (o.refunded) return 'refunded';
  const s = o.esim?.esimStatus, d = o.esim?.smdpStatus;
  if (s === 'IN_USE') return 'active'; if (s === 'USED_UP') return 'depleted'; if (s === 'USED_EXPIRED' || s === 'UNUSED_EXPIRED') return 'expired'; if (s === 'CANCEL') return 'refunded';
  if (s === 'REVOKE' || s === 'REVOKED') return 'revoked'; if (s === 'SUSPENDED') return 'suspended';
  return d === 'DOWNLOAD' || d === 'INSTALLATION' || d === 'ENABLED' ? 'installed' : 'ready';
}
// Code d'activation « LPA:1$adresse-SM-DP+$identifiant » : adresse et identifiant servent à l'installation manuelle.
const parseAc = (ac?: string) => { const p = String(ac ?? '').split('$'); return p.length >= 3 && p[0].toUpperCase().startsWith('LPA') ? { smdp: p[1], matchingId: p.slice(2).join('$') } : { smdp: null, matchingId: null }; };
// Vue envoyée au navigateur : aucun identifiant de commande ni de transaction du prestataire. `detail` ajoute le code d'activation (jamais dans les listes).
export const view = (id: string, o: Record<string, any>, detail = true) => {
  const e = o.esim ?? null, locs: string[] = o.locations ?? [];
  return { id, status: o.status as string, state: stateOf(o), title: o.title as string, scope: o.scope as string, locations: locs.slice(0, 8).map(c => ({ code: c, name: nameOf(c) })), locationCount: locs.length,
    gb: gbLabel(o.bytes ?? 0), days: o.days as number, daysLabel: daysLabel(o.days ?? 0), speed: o.speed || null, networks: (o.networks ?? []).slice(0, 3) as string[], total: fromUnits(o.chargeUnits ?? 0), refunded: !!o.refunded, error: o.error ?? null, createdAt: o.createdAtMs ?? null,
    iccid: e?.iccid ?? null, usage: e ? { total: e.totalVolume || o.bytes || 0, used: e.orderUsage || 0 } : null, expiresAt: e?.expiredTime ?? null, apn: e?.apn ?? null, canCancel: canCancel(o),
    ...(detail && e ? { ac: e.ac as string, ...parseAc(e.ac), activeType: o.activeType ?? 1 } : {}) };
};
async function own(uid: string, id: string) {
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) throw new HttpError(404, 'not_found');
  const o = (await ref(id).get()).data(); if (!o || o.merchantId !== uid) throw new HttpError(404, 'not_found'); return o;
}
// Profil lu chez le prestataire -> champs conservés (le code d'activation d'origine est gardé si la relecture n'en porte pas).
const pick = (e: any, old: Record<string, any> = {}) => ({ iccid: clip(e.iccid ?? old.iccid, 32), ac: clip(e.ac || old.ac, 200), smdpStatus: clip(e.smdpStatus ?? old.smdpStatus, 20), esimStatus: clip(e.esimStatus ?? old.esimStatus, 20),
  totalVolume: Number(e.totalVolume) || old.totalVolume || 0, orderUsage: Number(e.orderUsage) || 0, expiredTime: e.expiredTime ? clip(e.expiredTime, 40) : old.expiredTime ?? null, apn: e.apn ? clip(e.apn, 60) : old.apn ?? null });

// ---------- Achat ----------
export async function buyEsim(uid: string, p: { ref: string; slug: string; expected?: number }) {
  if (!SLUG.test(p.slug)) throw new HttpError(400, 'invalid_request');
  const id = idFor(uid, p.ref), known = await ref(id).get(); if (known.exists) return view(id, known.data()!);   // même référence : on renvoie la commande existante
  const plan = await freshPlan(p.slug);                                                                              // prix et disponibilité relus ICI, côté serveur
  checkPrice(p.expected, plan.chargeUnits);
  const created = await reserve(uid, id, { kind: 'esim', slug: plan.slug, packageCode: plan.code, title: plan.title, scope: plan.scope, locations: plan.locations.slice(0, 200), bytes: plan.bytes, days: plan.days, speed: plan.speed, networks: plan.networks, activeType: plan.activeType,
    providerPrice: plan.providerPrice, costUnits: plan.costUnits, chargeUnits: plan.chargeUnits, markupUnits: plan.chargeUnits - plan.costUnits, txnId: txnOf(id) });
  if (created) await dispatch(id);
  return view(id, (await ref(id).get()).data()!);
}
async function dispatch(id: string) {
  const o = (await ref(id).get()).data(); if (!o || o.status !== 'reserved') return;
  let r;
  try { r = await es('/esim/order', { transactionId: o.txnId, amount: o.providerPrice, packageInfoList: [{ slug: o.slug, count: 1, price: o.providerPrice }] }, { write: true }); }   // price/amount : le prestataire refuse l'ordre si son prix a changé (rien n'est débité)
  catch (e) { if (e instanceof EsError && e.ambiguous) await review(id, 'order_unknown'); else await fail(id, e); return; }
  const orderNo = r.j?.obj?.orderNo;
  if (!isOk(r) || !orderNo) { if (AMBIGUOUS.has(codeOf(r))) await review(id, 'order_unknown'); else await fail(id, failure(r), codeOf(r)); return; }
  // Commande acceptée : à partir d'ici les fonds ne sont plus JAMAIS rendus à l'aveugle. Si l'écriture échoue, la commande reste « reserved » et le cron la retrouve par son identifiant de transaction.
  try { await ref(id).update({ status: 'ordered', orderNo: clip(orderNo, 40), orderedAtMs: now(), updatedAtMs: now() }); } catch (e) { logError('esim.order_update_failed', { orderId: id, message: (e as Error).message }); return; }
  await sleep(Number(process.env.ESIM_PULL_DELAY_MS ?? 2500));                                                                                                 // l'allocation du profil prend quelques secondes : une lecture rapide suffit souvent à livrer tout de suite
  try { await pull(id); } catch (e) { if (!(e instanceof EsError)) warn('esim.pull_failed', { orderId: id, message: (e as Error).message }); }
}

// ---------- Récupération et suivi du profil ----------
// Lecture du profil d'une commande acceptée : « done » (livré et soldé), « waiting » (allocation en cours, code 200010), « missing » (commande inconnue du prestataire).
export async function pull(id: string): Promise<'done' | 'waiting' | 'missing'> {
  const o = (await ref(id).get()).data(); if (!o || o.status !== 'ordered' || !o.orderNo) return 'waiting';
  const r = await es('/esim/query', { orderNo: o.orderNo, pager: { pageNum: 1, pageSize: 5 } });
  if (!isOk(r)) return codeOf(r) === '310272' ? 'missing' : 'waiting';
  const e = (r.j?.obj?.esimList ?? [])[0]; if (!e?.iccid || !e?.ac || !e?.esimTranNo) return 'waiting';
  return (await settle(id, { esimTranNo: clip(e.esimTranNo, 40), esim: pick(e) })) ? 'done' : 'waiting';
}
async function refreshProfile(id: string, o: Record<string, any>) {
  const patch: Record<string, any> = { checkedMs: now() };
  try {
    const r = await es('/esim/query', { esimTranNo: o.esimTranNo, pager: { pageNum: 1, pageSize: 5 } }); const e = isOk(r) ? (r.j?.obj?.esimList ?? [])[0] : null;
    if (e) patch.esim = pick(e, o.esim ?? {});
  } catch (x) { if (!(x instanceof EsError)) throw x; }                                                              // prestataire injoignable : on garde la dernière valeur connue
  await ref(id).update(patch); if (patch.esim?.esimStatus === 'CANCEL' && !o.refunded) await refund(id);              // annulée chez le prestataire : remboursement (une seule fois)
}
async function sync(id: string, o: Record<string, any>, force = false) {
  const gap = now() - (o.checkedMs ?? 0);
  if (o.status === 'ordered') { if (force || gap >= 2000) { await ref(id).update({ checkedMs: now() }); try { await pull(id); } catch (e) { if (!(e instanceof EsError)) throw e; } } }
  else if (o.status === 'confirmed' && !o.refunded && o.esimTranNo && !TERMINAL.has(o.esim?.esimStatus) && (force || gap >= 3000)) await refreshProfile(id, o);   // au plus une lecture toutes les 3 s par commande
  return (await ref(id).get()).data()!;
}
export async function refreshOrder(uid: string, id: string) { const o = await own(uid, id); return view(id, await sync(id, o)); }
// Annulation d'une eSIM jamais installée : eSIM Access juge si elle est annulable ; on ne rembourse QUE si l'annulation est confirmée (réponse positive ou statut « CANCEL » relu à la source).
export async function cancelOrder(uid: string, id: string) {
  let o = await own(uid, id); if (o.status !== 'confirmed' || o.refunded || !o.esimTranNo) throw new HttpError(409, 'order_state');
  await refreshProfile(id, o); o = (await ref(id).get()).data()!; if (o.refunded) return view(id, o);              // statut relu à la source avant toute décision
  if (!canCancel(o)) throw new HttpError(409, 'cancel_rejected');
  let ok = false, why: HttpError = new HttpError(502, 'provider_unreachable');
  try { const r = await es('/esim/cancel', { esimTranNo: o.esimTranNo }, { write: true }); ok = isOk(r); if (!ok) why = failure(r); } catch (e) { if (!(e instanceof EsError)) throw e; why = e; }
  if (ok) await refund(id);
  else { await refreshProfile(id, o); const n = (await ref(id).get()).data()!; if (!n.refunded) throw why; }       // le prestataire a peut-être annulé malgré l'échec : la relecture rembourse si c'est le cas
  return view(id, (await ref(id).get()).data()!);
}

// ---------- Liste (filtre par état, recherche, pagination) ----------
export async function listOrders(uid: string, f: { page: number; size: number; q?: string; state?: string }) {
  const s = await db.collection('esim_orders').where('merchantId', '==', uid).limit(5000).get();
  const all = s.docs.map((d): Record<string, any> => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
  const live = (x: any) => ['ready', 'installed', 'active'].includes(stateOf(x));
  const stats = { total: all.filter(x => x.status !== 'failed').length, active: all.filter(live).length, spent: fromUnits(all.filter(x => x.status === 'confirmed' && !x.refunded).reduce((a, x) => a + (x.chargeUnits ?? 0), 0)) };
  const words = norm(f.q ?? '').split(' ').filter(Boolean), search = (x: any) => norm([x.title, ...(x.locations ?? []).slice(0, 60).map(nameOf), x.esim?.iccid ?? ''].join(' '));
  const rows = all.filter(x => (!f.state || stateOf(x) === f.state) && (!words.length || (t => words.every(w => t.includes(w)))(search(x))));
  const size = Math.min(100, Math.max(1, f.size)), page = Math.max(1, f.page);
  return { items: rows.slice((page - 1) * size, page * size).map(x => view(x.id, x, false)), total: rows.length, page, size, stats };
}

// ---------- Rapprochement (cron) : la source de vérité est eSIM Access ----------
const GRACE_MS = 45 * 60_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16) + '+00:00';
// Cherche, parmi les profils créés autour de l'heure de la commande, celui qui porte notre identifiant de transaction. Un échec de lecture lève une erreur (on réessaie plus tard) : jamais « introuvable » par défaut.
async function findByTxn(o: Record<string, any>) {
  for (let page = 1; page <= 5; page++) {
    const r = await es('/esim/query', { startTime: iso((o.createdAtMs ?? now()) - 5 * 60_000), endTime: iso(now() + 60_000), pager: { pageNum: page, pageSize: 500 } });
    if (!isOk(r)) throw new EsError(502, 'provider_unreachable');
    const list: any[] = r.j?.obj?.esimList ?? []; const hit = list.find(e => e?.transactionId === o.txnId); if (hit) return hit; if (list.length < 500) break;
  }
  return null;
}
export async function reconcileReview(id: string) {
  const o = (await ref(id).get()).data(); if (!o || o.status !== 'review') return;
  const age = now() - (o.createdAtMs ?? 0);
  try {
    const e = await findByTxn(o);
    if (e?.iccid && e?.ac && e?.esimTranNo) await settle(id, { orderNo: clip(e.orderNo, 40), esimTranNo: clip(e.esimTranNo, 40), esim: pick(e) });   // la commande a bien été exécutée : fonds soldés, eSIM livrée
    else if (!e && age > GRACE_MS) await release(id, 'provider_unreachable');                                                                          // rien chez le prestataire après le délai : fonds rendus
    else if (e) logError('esim.review_manual', { orderId: id });                                                                                       // commande retrouvée mais profil non livré : vérification manuelle, les fonds restent réservés
  } catch (e) { if (!(e instanceof EsError)) throw e; warn('esim.reconcile_retry', { orderId: id, code: (e as EsError).code }); }
}
// Commandes acceptées mais dont le profil n'est pas encore arrivé (webhook manqué, allocation lente).
export async function reconcileOrdered(id: string) {
  const o = (await ref(id).get()).data(); if (!o || o.status !== 'ordered') return;
  const age = now() - (o.orderedAtMs ?? o.createdAtMs ?? 0);
  try { const r = await pull(id); if (r === 'missing' && age > 20 * 60_000) await release(id, 'provider_unreachable'); else if (r === 'waiting' && age > 30 * 60_000) logError('esim.order_stuck', { orderId: id, ageMin: Math.round(age / 60_000) }); }
  catch (e) { if (!(e instanceof EsError)) throw e; }
}
// Commandes restées « reserved » (arrêt du serveur entre la réservation et l'appel) : l'issue est inconnue, elles passent en « review » où la source tranche.
export async function reconcileStalled(id: string) {
  const o = (await ref(id).get()).data(); if (!o || o.status !== 'reserved' || now() - (o.createdAtMs ?? 0) < 3 * 60_000) return;
  await review(id, 'stalled');
}

// ---------- Webhooks eSIM Access ----------
// Un webhook n'est qu'un SIGNAL : son contenu n'est jamais cru, la commande est relue chez le prestataire. Seules nos propres commandes (retrouvées par leur numéro) sont concernées.
const byOrderNo = async (orderNo: unknown) => { const n = clip(orderNo, 40); if (!/^[A-Za-z0-9]{6,40}$/.test(n)) return null; const s = await db.collection('esim_orders').where('orderNo', '==', n).limit(1).get(); return s.empty ? null : { id: s.docs[0].id, o: s.docs[0].data() as Record<string, any> }; };
export async function handleEvent(type: string, c: Record<string, any>, notifyId: string) {
  if (!['ORDER_STATUS', 'ESIM_STATUS', 'DATA_USAGE', 'VALIDITY_USAGE'].includes(type)) return 'ignored';
  const hit = await byOrderNo(c?.orderNo); if (!hit) return 'unknown_order';
  if (type === 'ORDER_STATUS' || type === 'ESIM_STATUS') { await sync(hit.id, hit.o, true); return 'synced'; }
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(notifyId)) return 'ignored';
  const low = type === 'DATA_USAGE' ? Number(c.remainThreshold) <= 0.1 : Number(c.remain) <= 1; if (!low) return 'ignored';
  try { await db.doc(`esim_events/${notifyId}`).create({ type, orderId: hit.id, createdAtMs: now() }); } catch { return 'duplicate'; }   // un même événement ne prévient l'utilisateur qu'une fois
  await sync(hit.id, hit.o, true);
  await notify(hit.o.merchantId, type === 'DATA_USAGE' ? 'Il reste peu de données sur votre eSIM' : 'Votre eSIM expire bientôt', type === 'DATA_USAGE' ? `Il reste moins de 10 % des données de votre eSIM « ${hit.o.title} ».` : `Votre eSIM « ${hit.o.title} » expire dans moins d’un jour.`).catch(() => {});
  return 'notified';
}
