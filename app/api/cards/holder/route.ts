import { rateLimit } from '@/lib/ratelimit';
import { guard } from '@/lib/cards/http';
import { registerHolder } from '@/lib/cards/holder';
import { Identity } from '@/lib/cards/identity';
export const POST = guard(async (req, _c, u) => {
  const b = Identity.parse(await req.json()); await rateLimit('cardholder_' + u.uid, 10, 3600);
  const h = await registerHolder(u.uid, u.email, b); return Response.json({ registered: h.registered });
});
