import { fail, requireUser } from '@/lib/auth';
import { byMerchant } from '@/lib/serialize';
export async function GET(req: Request) {
  try { const u = await requireUser(req); const t = new URL(req.url).searchParams.get('type') === 'webhooks' ? 'webhook_events' : 'api_usage';
    return Response.json(await byMerchant(t, u.uid, req));
  } catch (e) { return fail(e); }
}
