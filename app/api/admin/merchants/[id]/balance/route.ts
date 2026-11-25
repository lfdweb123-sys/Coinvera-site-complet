import { z } from 'zod';
import { db } from '@/lib/firebase-admin';
import { fail, HttpError, requireAdmin } from '@/lib/auth';
import { audit, notify } from '@/lib/audit';
import { adjustBalance } from '@/lib/adjust';
import { fromUnits } from '@/lib/money';
import { dec } from '@/lib/apikey';
import { twofaRefs } from '@/lib/twofa';
import { verifyTotp } from '@/lib/totp';
import { rateLimit } from '@/lib/ratelimit';
import { warn } from '@/lib/log';
// Solde actuel d'un marchand (pour l'assistant d'ajustement).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { await requireAdmin(req); const { id } = await params; const b = (await db.doc(`balances/${id}`).get()).data() ?? {};
    return Response.json({ available: fromUnits(b.available ?? 0), reserved: fromUnits(b.reserved ?? 0) });
  } catch (e) { return fail(e); }
}
// Crédit / retrait manuel : code 2FA de l'administrateur obligatoire, motif obligatoire, journal d'audit, notification au marchand.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const a = await requireAdmin(req); const { id } = await params; await rateLimit('adj_' + a.uid, 20, 600);
    const b = z.object({ direction: z.enum(['credit', 'debit']), amount: z.string().regex(/^\d{1,6}(\.\d{1,2})?$/), reason: z.string().trim().min(5).max(200), code: z.string().regex(/^\d{6}$/) }).parse(await req.json());
    const s = (await twofaRefs(a).secret.get()).data(); if (!s?.totpSecret) throw new HttpError(400, 'not_enabled');
    if (!verifyTotp(dec(s.totpSecret), b.code)) { warn('admin.adjust_invalid_code', { adminUid: a.uid }); throw new HttpError(400, 'code_invalid'); }
    const r = await adjustBalance({ adminUid: a.uid, merchantId: id, direction: b.direction, amount: b.amount, reason: b.reason });
    const amount = Number(b.amount).toFixed(2);
    await audit(a.uid, 'balance.' + b.direction, { merchantId: id, amount, reason: b.reason, adjustmentId: r.id, before: fromUnits(r.before), after: fromUnits(r.after) });
    await notify(id, b.direction === 'credit' ? `Votre solde a été crédité de ${amount} $` : `${amount} $ ont été retirés de votre solde`, `Motif : ${b.reason}`);
    return Response.json({ ok: true, id: r.id, before: fromUnits(r.before), after: fromUnits(r.after) });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
