import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { fail, requireUser } from '@/lib/auth';
import { enc, newKeyPair } from '@/lib/apikey';
import { rows } from '@/lib/serialize';
export async function GET(req: Request) {
  try { const u = await requireUser(req);
    const [keys, act] = await Promise.all([db.collection('api_keys').where('merchantId', '==', u.uid).get(), db.doc(`api_activations/${u.uid}`).get()]);
    return Response.json({ keys: rows(keys), activation: act.data() ?? {} });
  } catch (e) { return fail(e); }
}
// Le secret n'est renvoye qu'une seule fois, ici. Ensuite seul le chiffre est conserve.
export async function POST(req: Request) {
  try { const u = await requireUser(req); const { mode } = z.object({ mode: z.enum(['test', 'live']) }).parse(await req.json());
    const n = (await db.collection('api_keys').where('merchantId', '==', u.uid).where('status', '==', 'active').get()).size;
    if (n >= 5) return Response.json({ error: 'too_many_keys' }, { status: 400 });
    const { publicKey, secret } = newKeyPair();
    await db.collection('api_keys').add({ merchantId: u.uid, publicKey, secretEnc: enc(secret), mode, status: 'active', createdAt: FieldValue.serverTimestamp(), lastUsedAt: null });
    return Response.json({ publicKey, secret, mode }, { status: 201 });
  } catch (e) { return fail(e); }
}
