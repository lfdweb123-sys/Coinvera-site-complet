import { rateLimit, ipOf } from '@/lib/ratelimit';
import { fail } from '@/lib/auth';
import { esimEnabled } from '@/lib/esim/api';
import { summary } from '@/lib/esim/pricing';
// Page publique /esim : destinations et prix « à partir de » (prix de vente Coinvera, aucun identifiant de forfait ni de prestataire). Limité par adresse IP ; catalogue mis en cache côté serveur.
export async function GET(req: Request) {
  try {
    if (!esimEnabled()) return Response.json({ enabled: false, destinations: [], groups: [] });
    await rateLimit('espub_' + ipOf(req), 90, 60);
    return Response.json({ enabled: true, ...(await summary()) });
  } catch (e) { return fail(e); }
}
