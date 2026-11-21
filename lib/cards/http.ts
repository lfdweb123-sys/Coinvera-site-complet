import { z } from 'zod';
import { fail, HttpError, requireUser } from '../auth';
import { cardSettings } from './settings';
export type U = Awaited<ReturnType<typeof requireUser>>;
// Enveloppe commune des routes cartes : utilisateur marchand authentifié, service activé, erreurs normalisées.
export const guard = (fn: (req: Request, ctx: any, u: U) => Promise<Response>) => async (req: Request, ctx: any) => {
  try {
    const u = await requireUser(req); if (u.role !== 'merchant') throw new HttpError(403, 'forbidden');
    if (!(await cardSettings()).enabled) throw new HttpError(503, 'cards_disabled');
    return await fn(req, ctx, u);
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
};
export const idOf = async (ctx: any) => z.coerce.number().int().positive().parse((await ctx.params).id);
export const AMOUNT = z.string().regex(/^\d{1,6}(\.\d{1,2})?$/);
export const SPEC = z.object({ kind: z.enum(['issue', 'topup']), productCode: z.string().max(64).optional(), cardId: z.number().int().positive().optional(), amount: AMOUNT, nameOnCard: z.string().min(2).max(26).regex(/^[A-Za-z][A-Za-z .'-]*$/).optional() });
