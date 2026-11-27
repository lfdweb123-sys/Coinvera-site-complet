import { z } from 'zod';
import { fail } from '@/lib/auth';
import { adminAuth } from '@/lib/firebase-admin';
import { ipOf, rateLimit } from '@/lib/ratelimit';
import { reportCritical } from '@/lib/critical';
// Une page du site a planté chez un utilisateur : l'administrateur et le support en sont prévenus par e-mail (dédoublonné, plafonné).
// Public (la page peut planter avant la connexion) : limité par IP, taille bornée ; l'identité n'est lue que d'un jeton valide.
const B = z.object({ message: z.string().max(500).optional(), digest: z.string().max(80).optional(), path: z.string().max(200).optional() });
export async function POST(req: Request) {
  try {
    await rateLimit('rep_' + ipOf(req), 5, 3600);
    const raw = (await req.text()).slice(0, 4000); const b = B.parse(JSON.parse(raw || '{}'));
    let user: string | undefined; const t = req.headers.get('authorization')?.replace(/^Bearer /, '');
    if (t) { const d = await adminAuth.verifyIdToken(t).catch(() => null); if (d) user = `${d.email ?? ''} (${d.uid})`; }
    await reportCritical({ kind: 'client', title: 'Une page a planté', message: b.message, where: b.path, user, extra: b.digest ? [['Référence', b.digest]] : undefined });
    return Response.json({ ok: true });
  } catch (e) { return fail(e); }
}
