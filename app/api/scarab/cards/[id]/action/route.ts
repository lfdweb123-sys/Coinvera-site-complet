import { z } from 'zod';
import { rateLimit } from '@/lib/ratelimit';
import { guard, idOf } from '@/lib/scarab/http';
import { cardDetails, freezeCard, terminateCard, ownedCard } from '@/lib/scarab/cards';
import { requestWithdrawal } from '@/lib/scarab/withdraw';
import { HttpError } from '@/lib/auth';
import { takeCode } from '@/lib/scarab/webhook';
// Actions sur une carte : geler, dégeler, fermer, afficher les détails, lire le code de vérification. Propriété vérifiée dans chaque fonction (ownedCard).
const B = z.object({ action: z.enum(['freeze', 'unfreeze', 'terminate', 'details', 'code', 'withdraw']), amount: z.string().regex(/^\d{1,6}(\.\d{1,2})?$/).optional(), reason: z.enum(['no_longer_needed', 'lost', 'stolen', 'fraud', 'other']).optional() });
export const POST = guard(async (req, ctx, u) => {
  const id = await idOf(ctx); const b = B.parse(await req.json());
  if (b.action === 'freeze' || b.action === 'unfreeze') { await rateLimit('scarabfreeze_' + u.uid, 30, 3600); await freezeCard(u.uid, id, b.action); return Response.json({ ok: true }); }
  if (b.action === 'withdraw') { await rateLimit('scarabwd_' + u.uid, 20, 3600); if (!b.amount) throw new HttpError(400, 'invalid_amount'); return Response.json(await requestWithdrawal(u.uid, id, Math.round(Number(b.amount) * 100))); }
  if (b.action === 'terminate') { await rateLimit('scarabterm_' + u.uid, 10, 3600); await terminateCard(u.uid, id, b.reason ?? 'no_longer_needed'); return Response.json({ ok: true }); }
  if (b.action === 'details') { await rateLimit('scarabreveal_' + u.uid, 30, 3600); return Response.json(await cardDetails(u.uid, id), { headers: { 'Cache-Control': 'no-store' } }); }
  await rateLimit('scarabcode_' + u.uid, 60, 3600); await ownedCard(u.uid, id); const c = await takeCode(u.uid, id);
  return Response.json(c ? { available: true, ...c } : { available: false }, { headers: { 'Cache-Control': 'no-store' } });
});
