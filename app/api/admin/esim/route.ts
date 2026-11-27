import { z } from 'zod';
import { fail, requireAdmin } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { esimEnabled } from '@/lib/esim/api';
import { ADMIN_ACTIONS, adminAction, adminOverview, providerBalance } from '@/lib/esim/orders';
// Exploitant : solde du compte eSIM Access (un solde vide bloque tous les achats, les utilisateurs sont alors remboursés), commandes par état, dernières commandes, et actions sur une eSIM (suspendre, réactiver, révoquer, envoyer un SMS).
export async function GET(req: Request) {
  try { await requireAdmin(req);
    const [balance, o] = await Promise.all([esimEnabled() ? providerBalance().catch(() => null) : Promise.resolve(null), adminOverview()]);
    return Response.json({ enabled: esimEnabled(), balance, ...o });
  } catch (e) { return fail(e); }
}
export async function POST(req: Request) {
  try { const a = await requireAdmin(req);
    const b = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/), action: z.enum(Object.keys(ADMIN_ACTIONS) as [keyof typeof ADMIN_ACTIONS, ...(keyof typeof ADMIN_ACTIONS)[]]), message: z.string().min(1).max(500).optional() }).parse(await req.json());
    const r = await adminAction(b.id, b.action, b.message); await audit(a.uid, 'esim_' + b.action, { orderId: b.id });
    return Response.json(r);
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
