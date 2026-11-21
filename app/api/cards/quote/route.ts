import { fromUnits, toUnits } from '@/lib/money';
import { db } from '@/lib/firebase-admin';
import { guard, SPEC } from '@/lib/cards/http';
import { quote, quoteView } from '@/lib/cards/orders';
export const POST = guard(async (req, _c, u) => {
  const q = await quote(u.uid, SPEC.parse(await req.json())); const b = (await db.doc(`balances/${u.uid}`).get()).data(); const bal = (b?.available ?? 0) + (b?.card_credit ?? 0);   // crédit cartes + solde Coinvera
  return Response.json({ ...quoteView(q), credit: fromUnits(b?.card_credit ?? 0), balance: fromUnits(bal), covers: bal >= q.chargeUnits, missing: fromUnits(Math.max(0, q.chargeUnits - bal)) });
});
