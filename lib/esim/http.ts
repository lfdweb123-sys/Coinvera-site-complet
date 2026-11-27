import { z } from 'zod';
import { fail, HttpError, requireUser } from '../auth';
import { esimEnabled } from './api';
export type U = Awaited<ReturnType<typeof requireUser>>;
// Enveloppe commune des routes eSIM : utilisateur marchand authentifié (e-mail vérifié, 2FA), service configuré, erreurs normalisées.
export const guard = (fn: (req: Request, ctx: any, u: U) => Promise<Response>) => async (req: Request, ctx: any) => {
  try {
    const u = await requireUser(req); if (u.role !== 'merchant') throw new HttpError(403, 'forbidden');
    if (!esimEnabled()) throw new HttpError(503, 'esim_disabled');
    return await fn(req, ctx, u);
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
};
export const idOf = async (ctx: any) => String((await ctx.params).id);
export const REF = z.string().regex(/^[A-Za-z0-9_-]{8,40}$/);   // référence unique générée par le navigateur : un double clic ne peut jamais créer deux commandes
export const EXPECTED = z.number().int().positive().optional();   // total (unités 1e-6 USD) affiché à l'utilisateur : refus si le prix a augmenté entre-temps
export const intParam = (u: URLSearchParams, k: string, d: number) => { const n = Number(u.get(k)); return Number.isFinite(n) && n >= 1 ? Math.floor(n) : d; };
export const strParam = (u: URLSearchParams, k: string, max = 80) => (u.get(k) ?? '').slice(0, max);
