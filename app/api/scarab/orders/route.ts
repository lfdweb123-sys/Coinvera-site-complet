import { rateLimit } from '@/lib/ratelimit';
import { guard, SPEC } from '@/lib/scarab/http';
import { placeOrder, quote } from '@/lib/scarab/orders';
// Paiement depuis le solde Coinvera. Solde insuffisant -> 409 insufficient_balance (l'interface propose alors le paiement USDT direct).
export const POST = guard(async (req, _c, u) => {
  const spec = SPEC.parse(await req.json()); await rateLimit('scarabord_' + u.uid, 20, 3600);
  const q = await quote(u.uid, spec); const id = await placeOrder(u.uid, spec, q, { source: 'balance' });
  return Response.json({ id }, { status: 202 });
});
