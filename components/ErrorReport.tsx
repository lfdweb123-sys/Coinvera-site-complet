'use client';
import { useEffect } from 'react';
// Signale automatiquement le plantage d'une page à l'administrateur et au support, puis propose de réessayer.
export function useReportError(error: Error & { digest?: string }) {
  useEffect(() => {
    (async () => {
      try {
        const key = 'cv_rep_' + (error.digest ?? error.message).slice(0, 40); if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1');
        const { getAuth } = await import('firebase/auth'); const t = await getAuth().currentUser?.getIdToken().catch(() => undefined);
        await fetch('/api/report-error', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: JSON.stringify({ message: error.message?.slice(0, 400), digest: error.digest, path: location.pathname }), keepalive: true });
      } catch { /* le signalement ne doit jamais aggraver l'erreur */ }
    })();
  }, [error]);
}
export default function ErrorView({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useReportError(error);
  return <div style={{ maxWidth: 480, margin: '15vh auto', padding: 24, textAlign: 'center' }} role="alert"><h1 style={{ fontSize: 22 }}>Un problème est survenu</h1><p style={{ color: 'var(--mut, #667)' }}>Notre équipe vient d’en être informée automatiquement. Vous pouvez réessayer.</p><button className="btn p" onClick={reset}>Réessayer</button> <a className="btn" href="/dashboard" style={{ marginLeft: 8 }}>Tableau de bord</a></div>;
}
