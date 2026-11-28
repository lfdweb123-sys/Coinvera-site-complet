import { z } from 'zod';
import { db } from '@/lib/firebase-admin';
import { fail, HttpError, requireAdmin } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { fromUnits } from '@/lib/money';
import { sp, SpError } from '@/lib/scarab/client';
import { products, wallet } from '@/lib/scarab/catalog';
import { scarabSettings, pricingOf } from '@/lib/scarab/settings';
import { categoryOf, customerFee, feeOf, liveCost, centsToUsd, MARGIN_MAX, STARTER } from '@/lib/scarab/pricing';
import { resolveOrder } from '@/lib/scarab/orders';
import { resolveWithdrawal } from '@/lib/scarab/withdraw';
import { refillBlock, unblockRefill } from '@/lib/scarab/refill';
const Body = z.object({ enabled: z.boolean(), issueFlat: z.number().min(0).max(MARGIN_MAX.flat), issueBps: z.number().int().min(0).max(MARGIN_MAX.bps), loadFlat: z.number().min(0).max(MARGIN_MAX.flat), loadBps: z.number().int().min(0).max(MARGIN_MAX.bps), hidden: z.array(z.string().length(26)).max(50), billingAddress: z.string().trim().max(300) }).partial();
const SAMPLES = [1000, 5000, 10000, 20000, 50000];
// Réglages Virtuals cards pro + état du portefeuille du programme (celui qui paie réellement chaque carte chez ScarabPay) + marge réelle par produit au plan actuel.
export async function GET(req: Request) {
  try {
    await requireAdmin(req); const settings = await scarabSettings(); const pr = pricingOf(settings); let w: any = null, prods: any[] = [], addresses: any[] = [], error: string | null = null;
    try {
      const x = await wallet(true); w = { mode: x.mode, availableMinor: x.availableMinor, verification: x.mode_verification, plan: x.plan };
      prods = (await products()).map(p => { const cat = categoryOf(p.name ?? '');
        return { id: p.id, name: p.name, category: cat, hidden: (settings.hidden ?? []).includes(p.id), isDefault: !!p.is_default, rows: SAMPLES.map(a => { let cost: number | null = null; try { cost = liveCost('issue', p.fees, a); } catch {} const price = customerFee('issue', cat, a, pr.issue);
          let rc: number | null = null; try { rc = liveCost('topup', p.fees, a); } catch {} const rp = customerFee('topup', cat, a, pr.topup);
          return { amount: centsToUsd(a), issuePrice: centsToUsd(price), issueCost: cost == null ? null : centsToUsd(cost), issueGain: cost == null ? null : centsToUsd(price - cost), topupPrice: centsToUsd(rp), topupCost: rc == null ? null : centsToUsd(rc), topupGain: rc == null ? null : centsToUsd(rp - rc) }; }) }; });
      try { addresses = ((await sp('GET', '/deposit-addresses')).data as any[]) ?? []; } catch { /* clé de test : les dépôts n'existent qu'en production */ }
    } catch (e) { error = (e as Error).message; }
    const [open, review, fees] = await Promise.all([db.collection('scarab_orders').where('status', 'in', ['reserved', 'processing']).get(), db.collection('scarab_orders').where('status', '==', 'review').get(), db.collection('scarab_fees').get()]);
    const wdr = await db.collection('scarab_withdrawals').where('status', '==', 'review').get();
    let feeMinor = 0, passedUnits = 0; fees.forEach(d => { feeMinor += d.data().amountMinor ?? 0; passedUnits += d.data().chargedUnits ?? 0; });
    return Response.json({ refillBlock: await refillBlock().catch(() => null), settings, wallet: w, products: prods, addresses, error, starter: STARTER, pendingOrders: open.size, reviewOrders: review.docs.map(d => ({ id: d.id, kind: d.data().kind, amount: centsToUsd(d.data().amountMinor ?? 0), total: fromUnits(d.data().chargeUnits ?? 0), reason: d.data().reviewReason ?? null, merchantId: d.data().merchantId })), reviewWithdrawals: wdr.docs.map(d => ({ id: d.id, cardId: d.data().cardId, amount: centsToUsd(d.data().amountMinor ?? 0), merchantId: d.data().merchantId })), chargedFees: centsToUsd(feeMinor), passedOnFees: fromUnits(passedUnits), feeCount: fees.size });
  } catch (e) { return fail(e); }
}
export async function PUT(req: Request) {
  try { const a = await requireAdmin(req); const b = Body.parse(await req.json()); const before = await scarabSettings();
    await db.doc('scarab_settings/config').set(b, { merge: true }); await audit(a.uid, 'scarab.settings', { before, after: b }); return Response.json({ ok: true });
  } catch (e) { return fail(e); }
}
// Actions : trancher un ordre bloqué (confirmer = la carte existe, fonds dépensés ; rembourser = rendre les fonds à l'utilisateur) ; créer une adresse de dépôt pour alimenter le portefeuille.
const Act = z.discriminatedUnion('action', [z.object({ action: z.literal('refill-unblock') }), z.object({ action: z.literal('resolve'), orderId: z.string().min(1).max(80), decision: z.enum(['confirm', 'refund']) }), z.object({ action: z.literal('wd-resolve'), id: z.string().min(1).max(120), netMinor: z.number().int().min(0).nullable() }), z.object({ action: z.literal('deposit-address'), network: z.string().min(2).max(20) }), z.object({ action: z.literal('deposit-addresses-all') })]);
export async function POST(req: Request) {
  try { const a = await requireAdmin(req); const b = Act.parse(await req.json());
    if (b.action === 'resolve') { const o = (await db.doc(`scarab_orders/${b.orderId}`).get()).data(); if (!o || o.status !== 'review') throw new HttpError(409, 'scarab_wrong_state'); await resolveOrder(b.orderId, b.decision); await audit(a.uid, 'scarab.resolve', { orderId: b.orderId, decision: b.decision }); return Response.json({ ok: true }); }
    if (b.action === 'refill-unblock') { await unblockRefill(); await audit(a.uid, 'scarab.refill_unblock'); return Response.json({ ok: true }); }
    if (b.action === 'wd-resolve') { await resolveWithdrawal(b.id, b.netMinor); await audit(a.uid, 'scarab.wd_resolve', { id: b.id, netMinor: b.netMinor }); return Response.json({ ok: true }); }
    if (b.action === 'deposit-addresses-all') {
      // Idempotent (doc : « le réseau est la clé ») : une adresse existante est simplement renvoyée. Les réseaux désactivés chez le prestataire répondent 422 not_enabled.
      const results: { network: string; address?: string; asset?: string; memo?: string | null; error?: string }[] = [];
      for (const network of ['trc20', 'bep20', 'erc20', 'polygon', 'sol']) {
        try { const r = await sp('POST', '/deposit-addresses', { body: { network } }); results.push({ network, address: r.data?.address, asset: r.data?.asset, memo: r.data?.memo ?? null }); }
        catch (e) { results.push({ network, error: e instanceof SpError && e.status === 422 ? 'réseau non activé chez le prestataire' : (e as any)?.code ?? 'erreur' }); }
      }
      await audit(a.uid, 'scarab.deposit_addresses_all', { created: results.filter(r => r.address).map(r => r.network) }); return Response.json({ results });
    }
    // La doc exige l'identifiant du réseau en minuscules (« trc20 », « bep20 »…) ; une autre casse ou un réseau non activé donne un 422.
    const network = b.network.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    try { const r = await sp('POST', '/deposit-addresses', { body: { network } }); await audit(a.uid, 'scarab.deposit_address', { network }); return Response.json({ address: r.data }); }
    catch (e) { if (e instanceof SpError && e.status === 422) throw new HttpError(422, 'network_not_enabled'); throw e; }
  } catch (e) { return fail(e); }
}
