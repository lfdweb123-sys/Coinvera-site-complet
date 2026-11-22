import { z } from 'zod';
import { adminAuth, db } from '@/lib/firebase-admin';
import { fail, HttpError, requireSuper } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { rateLimit } from '@/lib/ratelimit';
// Suppression d'une ou plusieurs lignes des listes du tableau de bord admin. Réservée à l'administrateur principal, journalisée.
// Garde-fous serveur : on ne supprime jamais une ligne dont l'état porte de l'argent en cours (retrait non terminé, commande en attente, solde non nul).
type Guard = (d: Record<string, any>) => string | null;
const TERMINAL_WD = ['completed', 'failed'], DONE_ORDER = ['confirmed', 'expired', 'failed', 'cancelled', 'canceled', 'fulfilled', 'refunded'];
const LISTS: Record<string, Guard> = {
  transactions: () => null,
  withdrawals: d => TERMINAL_WD.includes(d.status) ? null : 'withdrawal_in_progress',
  balances: d => (d.available ?? 0) === 0 && (d.reserved ?? 0) === 0 ? null : 'balance_not_zero',
  api_keys: () => null, api_activations: () => null, notifications: () => null, audit_logs: () => null, woocommerce_licenses: () => null, support_tickets: () => null, webhook_events: () => null,
  crypto_orders: d => DONE_ORDER.includes(d.status) ? null : 'order_in_progress',
  merchants: () => null,   // contrôle du solde dans removeMerchant (document séparé)
};
async function removeMerchant(id: string) {
  if ((await db.doc(`admins/${id}`).get()).exists) throw new HttpError(403, 'protected_admin');   // un admin n'est jamais un marchand
  const bal = (await db.doc(`balances/${id}`).get()).data() ?? {};
  if ((bal.available ?? 0) !== 0 || (bal.reserved ?? 0) !== 0) throw new HttpError(409, 'balance_not_zero');
  const keys = await db.collection('api_keys').where('merchantId', '==', id).get(); const b = db.batch();
  keys.docs.forEach(k => b.delete(k.ref)); for (const c of ['merchants', 'merchant_settings', 'balances']) b.delete(db.doc(`${c}/${id}`)); await b.commit();
  await adminAuth.revokeRefreshTokens(id).catch(() => {}); await adminAuth.deleteUser(id).catch(() => {});
}
export async function DELETE(req: Request) {
  try { const u = await requireSuper(req); await rateLimit('recdel_' + u.uid, 60, 3600);
    const b = z.object({ c: z.string(), ids: z.array(z.string().min(1).max(200)).min(1).max(500) }).parse(await req.json());
    const guard = LISTS[b.c]; if (!guard) throw new HttpError(400, 'unknown_collection');
    let deleted = 0; const skipped: { id: string; reason: string }[] = []; const ok: string[] = [];
    for (const id of [...new Set(b.ids)]) {
      if (id.includes('/')) continue;
      const ref = db.doc(`${b.c}/${id}`); const s = await ref.get(); if (!s.exists) continue;
      const why = guard(s.data()!); if (why) { skipped.push({ id, reason: why }); continue; }
      try { if (b.c === 'merchants') await removeMerchant(id); else await ref.delete(); deleted++; ok.push(id); } catch (e) { skipped.push({ id, reason: (e as HttpError).code ?? 'error' }); }
    }
    await audit(u.uid, 'records.deleted', { collection: b.c, count: deleted, skipped: skipped.length, ids: ok.slice(0, 50) });
    return Response.json({ ok: true, deleted, skipped });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
