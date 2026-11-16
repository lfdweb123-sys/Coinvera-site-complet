import { FieldValue } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { fail, HttpError } from '@/lib/auth';
import { bad, lic } from '@/lib/license';
export async function POST(req: Request) {
  try { const { ref, site } = await lic(req);
    const out = await db.runTransaction(async tx => {
      const d = (await tx.get(ref)).data()!;
      if (d.status !== 'active') throw new HttpError(403, 'license_inactive');
      if (!d.sites.includes(site)) { if (d.sites.length >= d.maxActivations) throw new HttpError(409, 'activation_limit_reached'); tx.update(ref, { sites: FieldValue.arrayUnion(site) }); }
      return { valid: true, merchantId: d.merchantId };
    });
    return Response.json(out);
  } catch (e) { return bad(e) ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
