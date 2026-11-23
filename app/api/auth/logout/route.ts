import { adminAuth, db } from '@/lib/firebase-admin';
import { fail } from '@/lib/auth';
import { info } from '@/lib/log';
// Déconnexion totale : révoque tous les jetons de l'utilisateur sur tous ses appareils. Le serveur vérifie la révocation à chaque requête
// (verifyIdToken(..., true) dans lib/auth.ts) : dès que cet appel aboutit, le jeton actuel et tout jeton copié sont refusés (401 invalid_token).
export async function POST(req: Request) {
  try {
    const t = req.headers.get('authorization')?.replace(/^Bearer /, ''); if (!t) return Response.json({ ok: true });   // déjà déconnecté : rien à révoquer
    const dec = await adminAuth.verifyIdToken(t).catch(() => null); if (!dec) return Response.json({ ok: true });      // jeton expiré ou déjà révoqué
    await adminAuth.revokeRefreshTokens(dec.uid);
    await db.doc(`mfa_sessions/${dec.uid}`).delete().catch(() => {});                                                  // la double authentification doit être redemandée
    info('auth.logout_all', { uid: dec.uid });
    return Response.json({ ok: true });
  } catch (e) { return fail(e); }
}
