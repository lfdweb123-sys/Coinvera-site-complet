import { guard, idOf } from '@/lib/scarab/http';
import { cardView, refreshCard, cardRef } from '@/lib/scarab/cards';
import { getCustomer } from '@/lib/scarab/customers';
export const GET = guard(async (_r, ctx, u) => {
  const id = await idOf(ctx); await refreshCard(u.uid, id); const c = (await cardRef(id).get()).data()!;
  return Response.json({ card: cardView(c, await getCustomer(u.uid)) });
});
