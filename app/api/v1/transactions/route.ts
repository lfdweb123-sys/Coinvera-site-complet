import { verifyApiRequest } from '@/lib/apikey';
import { fail } from '@/lib/auth';
import { byMerchant } from '@/lib/serialize';
export async function GET(req: Request) {
  try { const a = await verifyApiRequest(req, '');
    const items = (await byMerchant('transactions', a.merchantId, 200)).filter((x: any) => !x.purpose).slice(0, 50);
    return Response.json({ data: items.map(({ merchantId, processorChargeId, ...x }: any) => x) });
  } catch (e) { return fail(e); }
}
