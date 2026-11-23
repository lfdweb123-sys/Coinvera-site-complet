import { z } from 'zod';
import { db } from '@/lib/firebase-admin';
import { fail, requireUser } from '@/lib/auth';
import { rateLimit } from '@/lib/ratelimit';
import { info } from '@/lib/log';
import { removeTransaction, type Outcome } from '@/lib/records';
// Suppression et révocation, à l'unité ou en masse, des données PROPRES à l'utilisateur connecté (propriété vérifiée sur chaque ligne côté serveur).
const OWN = ['notifications', 'support_tickets', 'api_keys', 'woocommerce_licenses', 'transactions'] as const;
const Body = z.object({ c: z.enum(OWN), ids: z.array(z.string().min(1).max(200)).min(1).max(500) });
async function owned(c: string, uid: string, ids: string[]) {
  const refs = [...new Set(ids)].filter(i => !i.includes('/')).map(i => db.doc(`${c}/${i}`)); if (!refs.length) return [];
  return (await db.getAll(...refs)).filter(s => s.exists && s.data()!.merchantId === uid);   // lignes d'un autre compte : ignorées sans rien révéler
}
export async function DELETE(req: Request) {
  try { const u = await requireUser(req); await rateLimit('mydel_' + u.uid, 120, 3600); const b = Body.parse(await req.json());
    const out: Outcome[] = [];
    for (const s of await owned(b.c, u.uid, b.ids)) {
      if (b.c === 'transactions') { if (s.data()!.purpose) { out.push({ id: s.id, result: 'skipped', reason: 'not_allowed' }); continue; } out.push(await removeTransaction(s.id, s.data()!)); }
      else { if (b.c === 'woocommerce_licenses') await db.doc(`api_activations/${u.uid}`).set({ licenseIssued: true }, { merge: true });   // une licence supprimée ne peut pas être régénérée (sinon : sites illimités)
        await s.ref.delete(); out.push({ id: s.id, result: 'deleted' }); }
    }
    const deleted = out.filter(o => o.result !== 'skipped').length, skipped = out.filter(o => o.result === 'skipped').map(o => ({ id: o.id, reason: o.reason! }));
    if (b.c !== 'notifications') info('user.records_deleted', { uid: u.uid, c: b.c, deleted, skipped: skipped.length });
    return Response.json({ ok: true, deleted, skipped });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
// Révocation (clés API, licences) : effet immédiat, la ligne reste visible avec le statut « revoked ».
export async function POST(req: Request) {
  try { const u = await requireUser(req); await rateLimit('myrev_' + u.uid, 120, 3600);
    const b = z.object({ c: z.enum(['api_keys', 'woocommerce_licenses']), ids: z.array(z.string().min(1).max(200)).min(1).max(500), action: z.literal('revoke') }).parse(await req.json());
    let revoked = 0; const batch = db.batch();
    for (const s of await owned(b.c, u.uid, b.ids)) if (s.data()!.status !== 'revoked') { batch.update(s.ref, { status: 'revoked', revokedAt: new Date() }); revoked++; }
    if (revoked) await batch.commit();
    return Response.json({ ok: true, revoked });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
