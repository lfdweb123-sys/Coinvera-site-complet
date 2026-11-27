'use client';
import { useEffect } from 'react';
// Renouvelle le cookie qui rend /admin visible, pour un administrateur DÉJÀ connecté (session conservée par le navigateur). Sans effet pour les autres :
// rien n'est chargé tant qu'aucune session n'existe, et l'API refuse le cookie à tout compte non administrateur.
export default function AdminGate() {
  useEffect(() => {
    try {
      if (!Object.keys(localStorage).some(k => k.startsWith('firebase:authUser:'))) return;
      const last = Number(sessionStorage.getItem('cv_adm_at') ?? 0); if (Date.now() - last < 6 * 3600_000) return;
      (async () => {
        const { auth } = await import('@/lib/client'); const { onAuthStateChanged } = await import('firebase/auth');
        const off = onAuthStateChanged(auth, async u => {
          off(); if (!u) return; const t = await u.getIdTokenResult().catch(() => null); if (t?.claims.role !== 'admin') return;
          const r = await fetch('/api/admin/gate', { method: 'POST', headers: { Authorization: 'Bearer ' + t.token } }).catch(() => null);
          if (r?.ok) sessionStorage.setItem('cv_adm_at', String(Date.now()));
        });
      })();
    } catch { /* stockage indisponible : le renouvellement se fait à la connexion */ }
  }, []);
  return null;
}
