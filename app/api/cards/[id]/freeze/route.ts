import { z } from 'zod';
import { guard, idOf } from '@/lib/cards/http';
import { ci } from '@/lib/cards/cryptoinfra';
import { ownedCard, syncCards } from '@/lib/cards/cards';
import { requireHolder } from '@/lib/cards/holder';
export const POST = guard(async (req, ctx, u) => {
  const id = await idOf(ctx); const { action } = z.object({ action: z.enum(['freeze', 'unfreeze']) }).parse(await req.json());
  await ownedCard(u.uid, id); const h = await requireHolder(u.uid);
  await ci('POST', `/v1/cards/${id}/${action}`, { body: { user_id: h.externalId } }); await syncCards(u.uid).catch(() => {}); return Response.json({ ok: true });
});
