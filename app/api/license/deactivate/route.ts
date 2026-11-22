import { db } from '@/lib/firebase-admin';
import { fail } from '@/lib/auth';
import { bad, lic } from '@/lib/license';
import { deactivateSlots } from '@/lib/license-slots';
// Libère le site seulement quand plus aucun plugin de la licence ne l'utilise (voir lib/license-slots.ts).
export async function POST(req: Request) {
  try { const { ref, site, plugin } = await lic(req);
    await db.runTransaction(async tx => { const d = (await tx.get(ref)).data()!; const next = deactivateSlots(d.sites ?? [], d.slots ?? [], site, plugin); tx.update(ref, { sites: next.sites, slots: next.slots }); });
    return Response.json({ ok: true });
  } catch (e) { return bad(e) ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
