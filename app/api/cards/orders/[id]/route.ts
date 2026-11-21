import { db } from '@/lib/firebase-admin';
import { HttpError } from '@/lib/auth';
import { guard } from '@/lib/cards/http';
import { orderView, reconcile } from '@/lib/cards/orders';
export const GET = guard(async (_r, ctx, u) => {
  const id = String((await ctx.params).id); const s = await db.doc(`card_orders/${id}`).get();
  if (!s.exists || s.data()!.merchantId !== u.uid) throw new HttpError(404, 'not_found');
  const o = await reconcile(id).catch(() => s.data()); return Response.json(orderView(id, o ?? s.data()!));
});
