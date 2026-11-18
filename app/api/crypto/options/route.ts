import { db } from '@/lib/firebase-admin';
import { fail, requireUser } from '@/lib/auth';
import { available } from '@/lib/cryptos';
import { getSettings } from '@/lib/settings';
export async function GET(req: Request) {
  try { const u = await requireUser(req); const s = await getSettings(); const act = (await db.doc(`api_activations/${u.uid}`).get()).data();
    return Response.json({ currencies: available().map(c => ({ id: c.id, sym: c.sym, net: c.net, name: c.name, scan: c.scan })), priceApi: s.apiActivationUsd, pricePlugin: s.pluginPriceUsd, activated: !!act?.activated });
  } catch (e) { return fail(e); }
}
