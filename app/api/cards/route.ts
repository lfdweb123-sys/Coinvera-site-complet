import { db } from '@/lib/firebase-admin';
import { fromUnits } from '@/lib/money';
import { ci } from '@/lib/cards/cryptoinfra';
import { guard } from '@/lib/cards/http';
import { getHolder } from '@/lib/cards/holder';
import { syncCards } from '@/lib/cards/cards';
import { orderView } from '@/lib/cards/orders';
// Vue d'ensemble : titulaire, cartes (soldes lus en direct quand possible), ordres récents, solde Coinvera.
export const GET = guard(async (_req, _c, u) => {
  const h = await getHolder(u.uid); let maintenance = false, live: any[] = [];
  try { maintenance = !!(await ci('GET', '/v1/cards/maintenance')).data.active; } catch { /* inconnu : on n'affiche pas de bannière */ }
  if (h?.registered) { try { live = await syncCards(u.uid); } catch { /* repli sur la copie locale */ } }
  const liveById = new Map(live.map(c => [c.id, c]));
  const items = await db.collection('card_items').where('merchantId', '==', u.uid).get();
  const cards = items.docs.map(d => { const c = d.data(); const l = liveById.get(c.ciCardId);
    return { id: c.ciCardId, last4: c.last4, status: c.status, nameOnCard: c.nameOnCard, productCode: c.productCode, balance: l?.balance ?? null, pending: l?.pending ?? null, otpWaiting: !!c.otpWaiting, closing: !!c.closeRequestedAt && c.status !== 'closed', refundPending: !!c.closeRequestedAt && !c.closeCredited, issuedAt: c.issuedAt }; })
    .sort((a, b) => String(b.issuedAt ?? '').localeCompare(String(a.issuedAt ?? '')));
  const os = await db.collection('card_orders').where('merchantId', '==', u.uid).get();
  const orders = os.docs.map(d => orderView(d.id, d.data())).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).slice(0, 20);
  const bal = (await db.doc(`balances/${u.uid}`).get()).data();
  return Response.json({ maintenance, holder: h ? { registered: !!h.registered, kycStatus: h.kycStatus ?? 'none', firstName: h.firstName ?? null, lastName: h.lastName ?? null, email: h.email } : null, cards, orders, balance: fromUnits(bal?.available ?? 0) });
});
