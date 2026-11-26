import { z } from 'zod';
import { fail, requireUser } from '@/lib/auth';
import { rateLimit } from '@/lib/ratelimit';
import { checkTopup } from '@/lib/topups';
const ID = z.string().regex(/^[0-9A-Za-z]{20}$/);
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const u = await requireUser(req); const id = ID.parse((await params).id); await rateLimit('tpc_' + id, 30, 60); return Response.json(await checkTopup(u.uid, id)); }
  catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
// Vérification par hash (cryptos sans surveillance automatique de l'adresse).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const u = await requireUser(req); const id = ID.parse((await params).id); await rateLimit('tpv_' + u.uid, 20, 3600); const b = z.object({ txid: z.string().trim().min(8).max(160) }).parse(await req.json()); return Response.json(await checkTopup(u.uid, id, b.txid)); }
  catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
