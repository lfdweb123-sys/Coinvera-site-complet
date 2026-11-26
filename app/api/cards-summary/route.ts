import { db } from '@/lib/firebase-admin';
import { fail, requireUser } from '@/lib/auth';
// Nombre de cartes en cours de l'utilisateur (standard et pro) : sert au tableau de bord à afficher « Voir ma carte » plutôt que « Activer ».
export async function GET(req: Request) {
  try {
    const u = await requireUser(req);
    const [std, pro] = await Promise.all([db.collection('card_items').where('merchantId', '==', u.uid).get(), db.collection('scarab_cards').where('merchantId', '==', u.uid).get()]);
    return Response.json({ standard: std.docs.filter(d => d.data().status !== 'closed').length, pro: pro.docs.filter(d => ['pending', 'active', 'frozen'].includes(d.data().status)).length });
  } catch (e) { return fail(e); }
}
