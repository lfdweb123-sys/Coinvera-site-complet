import { fromUnits, toUnits } from '@/lib/money';
import { db } from '@/lib/firebase-admin';
import { guard, SPEC } from '@/lib/cards/http';
import { quote, quoteView } from '@/lib/cards/orders';
export const POST = guard(async (req, _c, u) => {
  const q = await quote(u.uid, SPEC.parse(await req.json())); const bal = (await db.doc(`balances/${u.uid}`).get()).data()?.available ?? 0;
  return Response.json({ ...quoteView(q), balance: fromUnits(bal), covers: bal >= q.chargeUnits, missing: fromUnits(Math.max(0, q.chargeUnits - bal)) });
});
