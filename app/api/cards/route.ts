import { db } from '@/lib/firebase-admin';
import { fromUnits } from '@/lib/money';
import { ci } from '@/lib/cards/cryptoinfra';
import { guard } from '@/lib/cards/http';
import { getHolder } from '@/lib/cards/holder';
import { syncCards } from '@/lib/cards/cards';
import { orderView } from '@/lib/cards/orders';
import { fetchSpent, monthKey } from '@/lib/cards/stats';
// Vue d'ensemble : titulaire, cartes (soldes lus en direct quand possible), ordres récents, solde Coinvera.
export const GET = guard(async (_req, _c, u) => {
  const h = await getHolder(u.uid); let maintenance = false, live: any[] = [];
  try { maintenance = !!(await ci('GET', '/v1/cards/maintenance')).data.active; } catch { /* inconnu : on n'affiche pas de bannière */ }
  if (h?.registered) { try { live = await syncCards(u.uid); } catch { /* repli sur la copie locale */ } }
  const liveById = new Map(live.map(c => [c.id, c]));
  const items = await db.collection('card_items').where('merchantId', '==', u.uid).get();
  // Dépenses du mois (cache 10 min sur la carte, 4 cartes au plus par chargement) : colonne « Dépenses ce mois-ci » de la liste.
  const stale = items.docs.filter(d => { const c = d.data(); return ['active', 'suspended'].includes(c.status) && h?.externalId && (c.statsMonth !== monthKey() || Date.now() - (c.statsAt ?? 0) > 600_000); }).slice(0, 4), spentNow = new Map<string, number>();
  await Promise.allSettled(stale.map(async d => { const c = d.data(), v = await fetchSpent(h!.externalId, c.ciCardId); spentNow.set(c.ciCardId, v); await d.ref.set({ statsMonth: monthKey(), spentUsd: v, statsAt: Date.now() }, { merge: true }); }));
  const cards = items.docs.map(d => { const c = d.data(); const l = liveById.get(c.ciCardId); const sp = spentNow.get(c.ciCardId) ?? (c.statsMonth === monthKey() ? c.spentUsd : null);
    return { id: c.ciCardId, last4: c.last4, status: c.status, nameOnCard: c.nameOnCard, productCode: c.productCode, balance: l?.balance ?? null, pending: l?.pending ?? null, otpWaiting: !!c.otpWaiting, closing: !!c.closeRequestedAt && c.status !== 'closed', refundPending: !!c.closeRequestedAt && !c.settled, advanced: !!c.advanced, issuedAt: c.issuedAt, spentMonth: sp == null ? null : Number(sp).toFixed(2) }; })
    .sort((a, b) => String(b.issuedAt ?? '').localeCompare(String(a.issuedAt ?? '')));
  const os = await db.collection('card_orders').where('merchantId', '==', u.uid).get();
  // Recharges du mois par carte (ordres terminés, calendrier UTC).
  const m0 = Date.parse(monthKey() + '-01T00:00:00Z'), top = new Map<string, number>();
  for (const d of os.docs) { const o = d.data(), cid = o.ciCardId ?? o.cardId; if (o.kind === 'topup' && o.status === 'confirmed' && cid && (o.createdAtMs ?? 0) >= m0) top.set(cid, (top.get(cid) ?? 0) + (o.amount ?? 0)); }
  for (const c of cards as any[]) c.topupMonth = fromUnits(top.get(c.id) ?? 0);
  const orders = os.docs.map(d => orderView(d.id, d.data())).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).slice(0, 20);
  const bal = (await db.doc(`balances/${u.uid}`).get()).data();
  return Response.json({ maintenance, holder: h ? { registered: !!h.registered, kycStatus: h.kycStatus ?? 'none', firstName: h.firstName ?? null, lastName: h.lastName ?? null, email: h.email } : null, cards, orders, balance: fromUnits(bal?.available ?? 0), credit: fromUnits(bal?.card_credit ?? 0) });
});
