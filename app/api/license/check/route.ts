import { fail } from '@/lib/auth';
import { bad, lic } from '@/lib/license';
export async function POST(req: Request) {
  try { const { d, site } = await lic(req); return Response.json({ valid: d.status === 'active' && d.sites.includes(site) });
  } catch (e) { return bad(e) ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
