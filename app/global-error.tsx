'use client';
import { useReportError } from '@/components/ErrorReport';
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useReportError(error);
  return <html lang="fr"><body style={{ fontFamily: 'system-ui', textAlign: 'center', padding: '15vh 24px' }}><h1>Un problème est survenu</h1><p>Notre équipe vient d’en être informée automatiquement.</p><button onClick={reset}>Réessayer</button></body></html>;
}
