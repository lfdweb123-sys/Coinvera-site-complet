import { z } from 'zod';
import { db } from '@/lib/firebase-admin';
import { fail, HttpError, requireAdmin } from '@/lib/auth';
import { audit, notify } from '@/lib/audit';
import { adjustBalance, POOLS, POOL_LABEL } from '@/lib/adjust';
import { fromUnits } from '@/lib/money';
import { dec } from '@/lib/apikey';
import { twofaRefs } from '@/lib/twofa';
import { verifyTotp } from '@/lib/totp';
import { rateLimit } from '@/lib/ratelimit';
import { warn } from '@/lib/log';
// Soldes actuels d'un marchand tenus par Coinvera (pour l'assistant d'ajustement) : trois soldes ajustables + les montants réservés, en lecture seule.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { await requireAdmin(req); const { id } = await params; const b = (await db.doc(`balances/${id}`).get()).data() ?? {};
    return Response.json({ available: fromUnits(b.available ?? 0), card_credit: fromUnits(b.card_credit ?? 0), scarab_credit: fromUnits(b.scarab_credit ?? 0), reserved: fromUnits((b.reserved ?? 0) + (b.card_reserved ?? 0) + (b.scarab_reserved ?? 0)) });
  } catch (e) { return fail(e); }
}
// Crédit / retrait manuel : code 2FA de l'administrateur obligatoire, motif obligatoire, journal d'audit, notification au marchand.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const a = await requireAdmin(req); const { id } = await params; await rateLimit('adj_' + a.uid, 20, 600);
    const b = z.object({ pool: z.enum(POOLS).default('available'), direction: z.enum(['credit', 'debit']), amount: z.string().regex(/^\d{1,6}(\.\d{1,2})?$/), reason: z.string().trim().min(5).max(200), code: z.string().regex(/^\d{6}$/) }).parse(await req.json());
    const s = (await twofaRefs(a).secret.get()).data(); if (!s?.totpSecret) throw new HttpError(400, 'not_enabled');
    if (!verifyTotp(dec(s.totpSecret), b.code)) { warn('admin.adjust_invalid_code', { adminUid: a.uid }); throw new HttpError(400, 'code_invalid'); }
    const r = await adjustBalance({ adminUid: a.uid, merchantId: id, pool: b.pool, direction: b.direction, amount: b.amount, reason: b.reason });
    const amount = Number(b.amount).toFixed(2);
    await audit(a.uid, 'balance.' + b.direction, { merchantId: id, pool: b.pool, amount, reason: b.reason, adjustmentId: r.id, before: fromUnits(r.before), after: fromUnits(r.after) });
    const lab = POOL_LABEL[b.pool]; await notify(id, b.direction === 'credit' ? `Votre ${lab} a été crédité de ${amount} $` : `${amount} $ ont été retirés de votre ${lab}`, `Motif : ${b.reason}`);
    return Response.json({ ok: true, id: r.id, before: fromUnits(r.before), after: fromUnits(r.after) });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
