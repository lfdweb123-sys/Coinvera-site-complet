import { db } from '@/lib/firebase-admin';
import { fail, HttpError } from '@/lib/auth';
import { bad, lic } from '@/lib/license';
import { activateSlots } from '@/lib/license-slots';
export async function POST(req: Request) {
  try { const { ref, site, plugin } = await lic(req);
    const out = await db.runTransaction(async tx => {
      const d = (await tx.get(ref)).data()!;
      if (d.status !== 'active') throw new HttpError(403, 'license_inactive');
      const next = activateSlots(d.sites ?? [], d.slots ?? [], site, plugin);   // un site compte pour UNE activation, quel que soit le nombre de plugins
      if (next.addedSite && (d.sites ?? []).length >= d.maxActivations) throw new HttpError(409, 'activation_limit_reached');
      if (next.slots.length > 40) throw new HttpError(409, 'activation_limit_reached');   // borne les emplacements (plugin libre)
      tx.update(ref, { sites: next.sites, slots: next.slots });
      return { valid: true };
    });
    return Response.json(out);
  } catch (e) { return bad(e) ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
