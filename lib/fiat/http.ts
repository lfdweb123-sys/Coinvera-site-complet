import { z } from 'zod';
import { fail, HttpError, requireUser } from '../auth';
import { cardSettings } from '../cards/settings';
import { scarabSettings } from '../scarab/settings';
import type { Scope } from './orders';
export type U = Awaited<ReturnType<typeof requireUser>>;
export const SCOPE = z.enum(['cards', 'scarab']);
export const AMOUNT = z.string().regex(/^\d{1,6}(\.\d{1,2})?$/);
// Enveloppe des routes de dépôt mobile money / virement : marchand authentifié ; le service concerné (cartes virtuelles ou Virtuals cards pro) doit être activé.
export const guard = (fn: (req: Request, ctx: any, u: U) => Promise<Response>, scopeOf: (req: Request, ctx: any) => Promise<Scope | null> | Scope | null) => async (req: Request, ctx: any) => {
  try {
    const u = await requireUser(req); if (u.role !== 'merchant') throw new HttpError(403, 'forbidden');
    const sc = await scopeOf(req, ctx);
    if (sc) { const on = sc === 'scarab' ? (await scarabSettings()).enabled : (await cardSettings()).enabled; if (!on) throw new HttpError(503, sc === 'scarab' ? 'scarab_disabled' : 'cards_disabled'); }
    return await fn(req, ctx, u);
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
};
export const scopeParam = (req: Request) => SCOPE.parse(new URL(req.url).searchParams.get('scope'));
