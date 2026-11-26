import { z } from 'zod';
import { fail, HttpError, requireUser } from '@/lib/auth';
import { rateLimit } from '@/lib/ratelimit';
import { createTopup, options, TOPUP_MAX, TOPUP_MIN } from '@/lib/topups';
// Recharge du solde en crypto : GET = cryptos disponibles (adresses des variables d'environnement), POST = nouvelle recharge (montant exact unique à envoyer).
export async function GET(req: Request) { try { const u = await requireUser(req); if (u.role !== 'merchant') throw new HttpError(403, 'forbidden'); return Response.json({ currencies: options(), min: TOPUP_MIN, max: TOPUP_MAX }); } catch (e) { return fail(e); } }
export async function POST(req: Request) {
  try { const u = await requireUser(req); if (u.role !== 'merchant') throw new HttpError(403, 'forbidden'); await rateLimit('topup_' + u.uid, 10, 3600);
    const b = z.object({ cur: z.string().max(20), amount: z.string().regex(/^\d{1,6}(\.\d{1,2})?$/) }).parse(await req.json());
    return Response.json(await createTopup(u.uid, b.cur, b.amount), { status: 201 });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
