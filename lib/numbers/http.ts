import { z } from 'zod';
import { fail, HttpError, requireUser } from '../auth';
import { getSettings } from '../settings';
import { rateLimit } from '../ratelimit';
export type U = Awaited<ReturnType<typeof requireUser>>;
// Enveloppe commune des routes /api/numbers : utilisateur marchand authentifié (e-mail vérifié, 2FA), service activé, erreurs normalisées.
export const guard = (fn: (req: Request, ctx: any, u: U) => Promise<Response>) => async (req: Request, ctx: any) => {
  try {
    const u = await requireUser(req); if (u.role !== 'merchant') throw new HttpError(403, 'forbidden');
    if (req.method !== 'GET') await rateLimit('num_' + u.uid, 60, 60);   // anti-abus : 60 actions / minute / utilisateur
    if (!(await getSettings() as any).numbersEnabled) throw new HttpError(503, 'numbers_disabled');
    return await fn(req, ctx, u);
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
};
export const idOf = async (ctx: any) => String((await ctx.params).id);
export const REF = z.string().regex(/^[A-Za-z0-9_-]{8,40}$/);   // référence unique générée par le navigateur : un double clic ne peut jamais créer deux commandes
