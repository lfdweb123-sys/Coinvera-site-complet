import { db } from '@/lib/firebase-admin';
import { fromUnits } from '@/lib/money';
import { warn } from '@/lib/log';
import { guard } from '@/lib/scarab/http';
import { scarabSettings } from '@/lib/scarab/settings';
import { needsCustomer, products as allProducts, wallet } from '@/lib/scarab/catalog';
import { customerView, getCustomer, refreshCustomer } from '@/lib/scarab/customers';
import { listCards } from '@/lib/scarab/cards';
import { orderView } from '@/lib/scarab/orders';
// Vue d'ensemble : mode de vérification, dossier d'identité, cartes (soldes relus à la source), ordres récents, solde Coinvera.
export const GET = guard(async (_req, _c, u) => {
  const st = await scarabSettings(); if (!st.enabled) return Response.json({ enabled: false });
  let mode: 'merchant' | 'platform' | null = null;
  try { mode = needsCustomer(await wallet()) ? 'merchant' : 'platform'; } catch (e) { warn('scarab.overview_wallet_failed', { message: (e as Error).message }); }
  let customer = customerView(await getCustomer(u.uid));
  if (customer && customer.kycStatus !== 'approved') customer = await refreshCustomer(u.uid).catch(() => customer);
  const cards0 = await listCards(u.uid).catch(() => []);
  const os = await db.collection('scarab_orders').where('merchantId', '==', u.uid).get();
  const orders = os.docs.map(d => orderView(d.id, d.data())).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).slice(0, 20);
  // Recharges du mois par carte (ordres confirmés, calendrier UTC) et nom du type de carte, pour la liste des cartes.
  const m0 = Date.parse(new Date().toISOString().slice(0, 7) + '-01T00:00:00Z'), top = new Map<string, number>();
  for (const d of os.docs) { const o = d.data(); if (o.kind === 'topup' && o.status === 'confirmed' && o.spCardId && (o.createdAtMs ?? 0) >= m0) top.set(o.spCardId, (top.get(o.spCardId) ?? 0) + (o.amountMinor ?? 0)); }
  const names = new Map<string, string>(); try { for (const p of await allProducts()) names.set(p.id, p.name); } catch { /* catalogue indisponible : repli sur le nom générique */ }
  const cards = cards0.map(c => ({ ...c, productName: (c.productId && names.get(c.productId)) || null, topupMonth: ((top.get(c.id) ?? 0) / 100).toFixed(2) }));
  const bal = (await db.doc(`balances/${u.uid}`).get()).data();
  return Response.json({ enabled: true, unavailable: mode === null, mode, customer, cards, orders, balance: fromUnits(bal?.available ?? 0), credit: fromUnits(bal?.scarab_credit ?? 0), email: u.email, billingAddress: String(st.billingAddress ?? '') });
}, { allowDisabled: true });
