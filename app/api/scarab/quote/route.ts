import { db } from '@/lib/firebase-admin';
import { fromUnits } from '@/lib/money';
import { rateLimit } from '@/lib/ratelimit';
import { guard, SPEC } from '@/lib/scarab/http';
import { quote, quoteView } from '@/lib/scarab/orders';
export const POST = guard(async (req, _c, u) => {
  await rateLimit('scarabquote_' + u.uid, 120, 3600);
  const q = await quote(u.uid, SPEC.parse(await req.json())); const bal = (await db.doc(`balances/${u.uid}`).get()).data()?.available ?? 0;
  return Response.json({ ...quoteView(q), balance: fromUnits(bal), covers: bal >= q.chargeUnits, missing: fromUnits(Math.max(0, q.chargeUnits - bal)) });
});
