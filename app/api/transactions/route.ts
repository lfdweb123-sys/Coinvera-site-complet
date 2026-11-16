import { fail, requireUser } from '@/lib/auth';
import { byMerchant } from '@/lib/serialize';
export async function GET(req: Request) {
  try { const u = await requireUser(req);
    return Response.json({ items: (await byMerchant('transactions', u.uid, 400)).filter((x: any) => !x.purpose).slice(0, 200) });
  } catch (e) { return fail(e); }
}
