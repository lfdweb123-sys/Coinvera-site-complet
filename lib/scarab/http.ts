import { z } from 'zod';
import { fail, HttpError, requireUser } from '../auth';
import { scarabSettings } from './settings';
export type U = Awaited<ReturnType<typeof requireUser>>;
// Enveloppe commune des routes Carte Pro : utilisateur marchand authentifié, service activé, erreurs normalisées (avec le détail par champ des erreurs de validation).
export const guard = (fn: (req: Request, ctx: any, u: U) => Promise<Response>, o: { allowDisabled?: boolean } = {}) => async (req: Request, ctx: any) => {
  try {
    const u = await requireUser(req); if (u.role !== 'merchant') throw new HttpError(403, 'forbidden');
    if (!o.allowDisabled && !(await scarabSettings()).enabled) throw new HttpError(503, 'scarab_disabled');
    return await fn(req, ctx, u);
  } catch (e) {
    if (e instanceof z.ZodError) return Response.json({ error: 'validation_error', fields: Object.fromEntries(e.issues.map(i => [String(i.path[0] ?? 'form'), [i.message === 'underage' ? 'underage' : 'invalid']])) }, { status: 400 });
    const f = (e as any)?.fields; if (e instanceof HttpError && f && Object.keys(f).length) return Response.json({ error: e.code, fields: f }, { status: e.status });
    return fail(e);
  }
};
export const idOf = async (ctx: any) => z.string().regex(/^[0-9A-Za-z]{26}$/).parse((await ctx.params).id);
export const AMOUNT = z.string().regex(/^\d{1,6}(\.\d{1,2})?$/);
export const SPEC = z.object({ kind: z.enum(['issue', 'topup']), productId: z.string().length(26).optional(), cardId: z.string().length(26).optional(), amount: AMOUNT, nameOnCard: z.string().trim().regex(/^[A-Za-z][A-Za-z .'-]{1,49}$/).optional() });
