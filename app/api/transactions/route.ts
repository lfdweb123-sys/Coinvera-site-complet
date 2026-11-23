import { fail, requireUser } from '@/lib/auth';
import { byMerchant, pq } from '@/lib/serialize';
export async function GET(req: Request) {
  try { const u = await requireUser(req); const { u: q } = pq(req);
    const st = q.get('status') ?? '', s = (q.get('q') ?? '').toLowerCase(), from = q.get('from') ?? '', to = q.get('to') ?? '';
    return Response.json(await byMerchant('transactions', u.uid, req, (x: any) => !x.purpose && !x.hidden && (!st || x.status === st)
      && (!s || (x.id + (x.title ?? '') + (x.orderRef ?? '')).toLowerCase().includes(s)) && (!from || x.createdAt >= from) && (!to || x.createdAt <= to + 'T23:59:59')));
  } catch (e) { return fail(e); }
}
