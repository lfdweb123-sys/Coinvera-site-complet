import { db } from '@/lib/firebase-admin';
import { fail, requireUser } from '@/lib/auth';
// Historique : les 50 dernières conversations de la personne connectée.
export async function GET(req: Request) {
  try { const u = await requireUser(req);
    const s = await db.collection('ai_chats').where('uid', '==', u.uid).limit(300).get();   // tri en mémoire : évite un index composite Firestore
    return Response.json({ items: s.docs.map(d => ({ id: d.id, title: d.data().title, updatedAt: d.data().updatedAt as number })).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 50) });
  } catch (e) { return fail(e); }
}
// Efface tout l'historique de la personne.
export async function DELETE(req: Request) {
  try { const u = await requireUser(req); let n = 0;
    for (let i = 0; i < 10; i++) { const s = await db.collection('ai_chats').where('uid', '==', u.uid).limit(300).get(); if (s.empty) break; const b = db.batch(); s.docs.forEach(d => b.delete(d.ref)); await b.commit(); n += s.size; }
    return Response.json({ ok: true, deleted: n });
  } catch (e) { return fail(e); }
}
