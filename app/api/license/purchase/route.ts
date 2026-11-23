import { FieldValue } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { fail, HttpError, requireUser } from '@/lib/auth';
import { rows } from '@/lib/serialize';
import { licenseKey } from '@/lib/purchase';
import { getSettings } from '@/lib/settings';
import { info } from '@/lib/log';
export async function GET(req: Request) {
  try { const u = await requireUser(req); return Response.json({ items: rows(await db.collection('woocommerce_licenses').where('merchantId', '==', u.uid).get()) }); } catch (e) { return fail(e); }
}
// Licence incluse dans l'activation : un compte active qui n'en a pas encore (activation anterieure) peut la generer gratuitement.
export async function POST(req: Request) {
  try { const u = await requireUser(req);
    if (!(await db.doc(`api_activations/${u.uid}`).get()).data()?.activated) throw new HttpError(402, 'activation_required');
    const ex = await db.collection('woocommerce_licenses').where('merchantId', '==', u.uid).limit(1).get(); if (!ex.empty) return Response.json({ ok: true, existing: true });
    if ((await db.doc(`api_activations/${u.uid}`).get()).data()?.licenseIssued) throw new HttpError(409, 'license_already_issued');   // licence déjà émise puis supprimée : pas de régénération gratuite (limite de sites contournée)
    const s = await getSettings(); await db.collection('woocommerce_licenses').add({ merchantId: u.uid, key: licenseKey(), status: 'active', sites: [], maxActivations: s.maxLicenseActivations, createdAt: FieldValue.serverTimestamp() });
    await db.doc(`api_activations/${u.uid}`).set({ licenseIssued: true }, { merge: true }); info('license.generated', { merchantId: u.uid }); return Response.json({ ok: true }, { status: 201 });
  } catch (e) { return fail(e); }
}
