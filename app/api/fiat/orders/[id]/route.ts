import { z } from 'zod';
import { rateLimit } from '@/lib/ratelimit';
import { guard } from '@/lib/fiat/http';
import { checkFiatOrder, confirmOtp } from '@/lib/fiat/orders';
const ID = z.string().regex(/^[0-9A-Za-z]{20}$/);
export const GET = guard(async (_r, ctx, u) => Response.json(await checkFiatOrder(u.uid, ID.parse((await ctx.params).id))), () => null);
// Étape code (Coris, B-MO) : l'utilisateur saisit le code reçu par SMS.
export const POST = guard(async (req, ctx, u) => {
  const id = ID.parse((await ctx.params).id); const b = z.object({ otp: z.string().regex(/^\d{3,8}$/) }).parse(await req.json()); await rateLimit('fiatotp_' + u.uid, 20, 3600);
  return Response.json(await confirmOtp(u.uid, id, b.otp, u.merchant, u.email));
}, () => null);
