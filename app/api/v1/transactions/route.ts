import { verifyApiRequest } from '@/lib/apikey';
import { fail } from '@/lib/auth';
import { byMerchant } from '@/lib/serialize';
// GET /api/v1/transactions?page=1&size=20 (size max 100)
export async function GET(req: Request) {
  try { const a = await verifyApiRequest(req, '');
    const r = await byMerchant('transactions', a.merchantId, req, (x: any) => !x.purpose);
    return Response.json({ data: r.items.map(({ merchantId, processorChargeId, ...x }: any) => x), total: r.total, page: r.page, size: r.size });
  } catch (e) { return fail(e); }
}
