import { z } from 'zod';
import { rateLimit } from '@/lib/ratelimit';
import { guard } from '@/lib/cards/http';
import { registerHolder } from '@/lib/cards/holder';
const Name = z.string().trim().min(1).max(64).regex(/^[\p{L}][\p{L} .'-]*$/u);
export const POST = guard(async (req, _c, u) => {
  const b = z.object({ firstName: Name, lastName: Name }).parse(await req.json()); await rateLimit('cardholder_' + u.uid, 10, 3600);
  const h = await registerHolder(u.uid, u.email, b); return Response.json({ registered: h.registered });
});
