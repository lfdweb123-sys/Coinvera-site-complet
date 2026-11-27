import { cronAllowed } from '@/lib/cron';
import { sweep } from '@/lib/numbers/orders';
// À planifier toutes les 5 minutes sur cron-job.org (GET, en-tête Authorization: Bearer $CRON_SECRET). Filet de sécurité : relit chez 5sim chaque commande en attente ou d'issue incertaine
// et rembourse (délai dépassé, annulée, refusée) même si l'utilisateur a fermé la page.
export async function GET(req: Request) {
  if (!cronAllowed(req)) return new Response('forbidden', { status: 403 });
  return Response.json({ ok: true, ...(await sweep()) });
}
