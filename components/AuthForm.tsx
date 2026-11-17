'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createUserWithEmailAndPassword, GithubAuthProvider, GoogleAuthProvider, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, updateProfile } from 'firebase/auth';
import { Eye, EyeOff, Github } from 'lucide-react';
import { api, auth, useAuthUser } from '@/lib/client';
import { LogoMark } from '@/components/Illustrations';
import { BannerArt } from '@/components/Art';
import { CardLogos, GoogleG } from '@/components/Logos';
const E: Record<string, string> = { 'auth/invalid-credential': 'Email ou mot de passe incorrect.', 'auth/too-many-requests': 'Trop de tentatives : réessayez plus tard.', 'auth/email-already-in-use': 'Cette adresse est déjà utilisée.', 'auth/weak-password': 'Mot de passe trop faible (8 caractères minimum).', 'auth/user-disabled': 'Ce compte est désactivé.', 'auth/account-exists-with-different-credential': 'Un compte existe déjà avec une autre méthode de connexion.', 'auth/popup-closed-by-user': 'Connexion annulée.' };
const strength = (p: string) => [p.length >= 8, /[A-Z]/.test(p) && /[a-z]/.test(p), /\d/.test(p), /[^A-Za-z0-9]/.test(p), p.length >= 12].filter(Boolean).length;
export default function AuthForm({ mode }: { mode: 'login' | 'register' | 'forgot' }) {
  const r = useRouter(); const { user } = useAuthUser(); useEffect(() => { if (user && mode !== 'forgot') r.replace('/dashboard'); }, [user, mode, r]);
  const [f, setF] = useState({ name: '', company: '', email: '', pw: '', terms: false }), [show, setShow] = useState(false), [err, setErr] = useState(''), [ok, setOk] = useState(''), [busy, setBusy] = useState(false);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const go = async (fn: () => Promise<void>) => { setErr(''); setOk(''); setBusy(true); try { await fn(); } catch (x: any) { setErr(E[x?.code] ?? 'Une erreur est survenue. Vérifiez les champs.'); } setBusy(false); };
  const social = (P: any) => go(async () => { const c = await signInWithPopup(auth, new P()); await api('/api/auth/init', { method: 'POST', body: JSON.stringify({ fullName: c.user.displayName || c.user.email!.split('@')[0], company: '' }) }); r.push('/dashboard'); });
  const submit = (e: React.FormEvent) => { e.preventDefault(); go(async () => {
    if (mode === 'forgot') { await sendPasswordResetEmail(auth, f.email); setOk('Si ce compte existe, un email de réinitialisation vient d’être envoyé.'); return; }
    if (mode === 'login') { await signInWithEmailAndPassword(auth, f.email, f.pw); r.push('/dashboard'); return; }
    if (!f.terms) throw { code: 'x' };
    const c = await createUserWithEmailAndPassword(auth, f.email, f.pw); await updateProfile(c.user, { displayName: f.name });
    await api('/api/auth/init', { method: 'POST', body: JSON.stringify({ fullName: f.name, company: f.company }) }); await sendEmailVerification(c.user); r.push('/dashboard'); }); };
  const sc = strength(f.pw), col = ['#E5EAF2', '#D14343', '#D14343', '#E0A100', '#0E9F6E', '#0E9F6E'][sc];
  const title = mode === 'login' ? 'Connexion' : mode === 'register' ? 'Créer un compte' : 'Mot de passe oublié';
  const sub = mode === 'login' ? 'Saisissez votre email et votre mot de passe pour accéder à votre compte.' : mode === 'register' ? 'Configurez votre compte marchand pour commencer à accepter des paiements.' : 'Saisissez votre email : nous vous envoyons un lien de réinitialisation.';
  return <div className="authp"><div className="auth-l"><Link href="/" className="logo" aria-label="Retour à l’accueil"><LogoMark s={36} />Coinvera</Link>
    <div className="auth-c"><h1>{title}</h1><p className="mut" style={{ fontSize: 16, marginBottom: 24 }}>{sub}</p>
      {mode !== 'forgot' && <><div className="g2" style={{ gap: 10 }}><button className="btn lg" onClick={() => social(GoogleAuthProvider)} disabled={busy} style={{ minHeight: 54 }}><GoogleG />Google</button><button className="btn lg" onClick={() => social(GithubAuthProvider)} disabled={busy} style={{ minHeight: 54 }}><Github size={20} />GitHub</button></div>
        <div className="sep">{mode === 'login' ? 'Ou connexion par email' : 'Ou inscription par email'}</div></>}
      <form onSubmit={submit}>
        {mode === 'register' && <div className="g2" style={{ gap: 10 }}><input className="in fill" required minLength={2} value={f.name} onChange={set('name')} autoComplete="name" placeholder="Nom complet" aria-label="Nom complet" /><input className="in fill" required value={f.company} onChange={set('company')} autoComplete="organization" placeholder="Entreprise ou projet" aria-label="Entreprise ou projet" /></div>}
        <input className="in fill" style={{ marginTop: mode === 'register' ? 14 : 0 }} type="email" required value={f.email} onChange={set('email')} autoComplete="email" placeholder="Adresse email" aria-label="Adresse email" />
        {mode !== 'forgot' && <><div className="pw" style={{ marginTop: 14 }}><input className="in fill" type={show ? 'text' : 'password'} required minLength={8} value={f.pw} onChange={set('pw')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="Mot de passe" aria-label="Mot de passe" style={{ paddingRight: 52 }} />
          <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>{show ? <EyeOff size={20} /> : <Eye size={20} />}</button></div>
          {mode === 'register' && f.pw && <div className="str"><i style={{ width: sc * 20 + '%', background: col }} /></div>}</>}
        {mode === 'login' && <div style={{ textAlign: 'right', margin: '14px 0 6px' }}><Link href="/forgot-password" className="mut">Mot de passe oublié ?</Link></div>}
        {mode === 'register' && <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontWeight: 400, marginTop: 16 }}><input type="checkbox" checked={f.terms} onChange={set('terms')} required style={{ marginTop: 4, width: 18, height: 18 }} /><span>J’accepte les <Link href="/terms" target="_blank" style={{ textDecoration: 'underline', color: 'inherit' }}>conditions d’utilisation</Link> et la <Link href="/privacy" target="_blank" style={{ textDecoration: 'underline', color: 'inherit' }}>politique de confidentialité</Link>.</span></label>}
        {err && <div className="err" role="alert">{err}</div>}{ok && <div className="okm">{ok}</div>}
        <button className="btn p lg full" style={{ marginTop: 20, minHeight: 56 }} disabled={busy}>{busy ? 'Patientez…' : mode === 'login' ? 'Se connecter' : mode === 'register' ? 'Créer mon compte' : 'Envoyer le lien'}</button></form>
      <p style={{ textAlign: 'center', marginTop: 22 }}>{mode === 'login' ? <Link href="/register" style={{ fontWeight: 600 }}>Créer un compte</Link> : <>{mode === 'register' ? 'Vous avez déjà un compte ? ' : ''}<Link href="/login" style={{ fontWeight: 600 }}>Connexion</Link></>}</p></div>
    <p className="mut" style={{ fontSize: 12.5, margin: 0 }}>© {new Date().getFullYear()} COINVERA. Tous droits réservés. · <Link href="/terms">Conditions</Link> · <Link href="/privacy">Confidentialité</Link> · <Link href="/contact">Support</Link></p></div>
    <aside className="auth-r on-dark"><BannerArt v={3} /><div style={{ marginBottom: 'auto', alignSelf: 'flex-start' }}><span className="cl" style={{ background: 'rgba(255,255,255,.12)', width: 'auto', padding: '8px 14px', color: '#fff', fontWeight: 700 }}><LogoMark s={26} /><span style={{ marginLeft: 8 }}>Coinvera</span></span></div>
      <div style={{ marginBottom: 18 }}><CardLogos /></div><p style={{ color: '#C9D5EA', fontSize: 18, margin: '0 0 8px' }}>Acceptez les cartes, retirez en crypto</p><h2>Simple · Direct · Sans frontières</h2></aside></div>;
}
