'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MailCheck } from 'lucide-react';
import { api, auth, logout, msg, useAuthUser } from '@/lib/client';
import AuthShell from '@/components/AuthShell';
import OtpInput from '@/components/OtpInput';
import { PageLoader } from '@/components/Loader';
const mask = (e: string) => e.replace(/^(.).*(@.*)$/, (_, a, b) => a + '•••' + b);
export default function VerifyEmail() {
  const r = useRouter(); const { ready, user } = useAuthUser(); const [code, setCode] = useState(''), [err, setErr] = useState(''), [ok, setOk] = useState(''), [busy, setBusy] = useState(false), [wait, setWait] = useState(60);
  const send = useCallback(async (silent = false) => { setErr(''); try { await api('/api/auth/send-code', { method: 'POST' }); setWait(60); if (!silent) setOk('Un nouveau code vient d’être envoyé.'); } catch (e) { if ((e as Error).message === 'too_soon') setWait(30); else setErr(msg(e)); } }, []);
  useEffect(() => { if (!ready) return; if (!user) { r.replace('/login'); return; } if (user.emailVerified) { r.replace('/dashboard'); return; }
    const k = 'cv_code_' + user.uid; if (!sessionStorage.getItem(k)) { sessionStorage.setItem(k, '1'); send(true); } }, [ready, user, r, send]);
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(w => w - 1), 1000); return () => clearTimeout(t); }, [wait]);
  async function verify(c: string) { if (busy || c.length < 6) return; setBusy(true); setErr(''); setOk('');
    try { await api('/api/auth/verify-code', { method: 'POST', body: JSON.stringify({ code: c }) }); await auth.currentUser!.reload(); await auth.currentUser!.getIdToken(true); setOk('Adresse vérifiée. Redirection…'); r.replace('/dashboard'); }
    catch (e) { setErr(msg(e)); setCode(''); } setBusy(false); }
  if (!ready || !user || user.emailVerified) return <PageLoader full />;
  return <AuthShell title="Vérifiez votre e-mail" sub={<>Nous avons envoyé un code à 6 chiffres à <b style={{ color: 'var(--ink)' }}>{mask(user.email ?? '')}</b>. Saisissez-le ci-dessous pour activer votre compte.</>}
    foot={<p className="mut" style={{ textAlign: 'center', marginTop: 22 }}>Mauvaise adresse ? <a href="#" onClick={async e => { e.preventDefault(); await logout(); r.replace('/register'); }} style={{ fontWeight: 600 }}>Recommencer</a></p>}>
    <div className="ic" style={{ margin: '0 0 18px' }}><MailCheck size={24} /></div>
    <OtpInput value={code} onChange={setCode} onComplete={verify} disabled={busy} invalid={!!err} />
    {err && <div className="err" role="alert" style={{ marginTop: 12 }}>{err}</div>}{ok && <div className="okm" style={{ marginTop: 12 }}>{ok}</div>}
    <button className="btn p lg full" style={{ marginTop: 22, minHeight: 56 }} disabled={busy || code.length < 6} onClick={() => verify(code)}>{busy ? 'Vérification…' : 'Vérifier mon adresse'}</button>
    <p className="mut" style={{ textAlign: 'center', marginTop: 18 }}>{wait > 0 ? `Vous pourrez demander un nouveau code dans ${wait} s` : <>Vous n’avez rien reçu ? <a href="#" onClick={e => { e.preventDefault(); send(); }} style={{ fontWeight: 600 }}>Renvoyer le code</a></>}</p>
    <p className="mut" style={{ textAlign: 'center', fontSize: 13 }}>Pensez à vérifier vos courriers indésirables.</p>
  </AuthShell>;
}
