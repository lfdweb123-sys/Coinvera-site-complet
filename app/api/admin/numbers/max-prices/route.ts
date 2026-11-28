import { z } from 'zod';
import { fail, HttpError, requireAdmin } from '@/lib/auth';
import { FivesimError, deleteMaxPrice, setMaxPrice } from '@/lib/numbers/fivesim';
// Limite de prix par produit chez 5sim (« Prices limit » de la documentation) : 5sim refuse tout achat plus cher que la limite. POST = créer ou modifier, DELETE = supprimer.
const Set = z.object({ product: z.string().trim().min(1).max(60), price: z.number().positive().max(100_000) });
const Del = z.object({ product: z.string().trim().min(1).max(60) });
const run = async (f: () => Promise<void>) => { try { await f(); } catch (e) { if (e instanceof FivesimError) throw new HttpError(e.code === 'unknown' || e.httpStatus === 400 ? 400 : 503, e.code === 'unknown' ? 'invalid_request' : 'numbers_unavailable'); throw e; } };
export async function POST(req: Request) { try { await requireAdmin(req); const b = Set.parse(await req.json()); await run(() => setMaxPrice(b.product, b.price)); return Response.json({ ok: true }); } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); } }
export async function DELETE(req: Request) { try { await requireAdmin(req); const b = Del.parse(await req.json()); await run(() => deleteMaxPrice(b.product)); return Response.json({ ok: true }); } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); } }
