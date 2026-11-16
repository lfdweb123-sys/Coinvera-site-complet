'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createUserWithEmailAndPassword, GithubAuthProvider, GoogleAuthProvider, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, updateProfile } from 'firebase/auth';
import { api, auth } from '@/lib/client';
import { Header } from '@/components/Site';
import { LogoMark } from '@/components/Illustrations';
import { Check } from 'lucide-react';
const E: Record<string, string> = { 'auth/invalid-credential': 'Email ou mot de passe incorrect.', 'auth/too-many-requests': 'Trop de tentatives : réessayez plus tard.', 'auth/email-already-in-use': 'Cette adresse est déjà utilisée.', 'auth/weak-password': 'Mot de passe trop faible (8 caractères minimum).', 'auth/user-disabled': 'Ce compte est désactivé.', 'auth/account-exists-with-different-credential': 'Un compte existe déjà avec une autre méthode de connexion.' };
export default function AuthForm({ mode }: { mode: 'login' | 'register' | 'forgot' }) {
  const r = useRouter(); const [f, setF] = useState({ name: '', company: '', email: '', pw: '', pw2: '', terms: false }), [err, setErr] = useState(''), [ok, setOk] = useState(''), [busy, setBusy] = useState(false);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const go = async (fn: () => Promise<void>) => { setErr(''); setOk(''); setBusy(true); try { await fn(); } catch (x: any) { setErr(E[x?.code] ?? 'Une erreur est survenue.'); } setBusy(false); };
  const social = (P: any) => go(async () => { const c = await signInWithPopup(auth, new P()); await api('/api/auth/init', { method: 'POST', body: JSON.stringify({ fullName: c.user.displayName || c.user.email!.split('@')[0], company: '' }) }); r.push('/dashboard'); });
  const submit = (e: React.FormEvent) => { e.preventDefault(); go(async () => {
    if (mode === 'forgot') { await sendPasswordResetEmail(auth, f.email); setOk('Si ce compte existe, un email de réinitialisation a été envoyé.'); return; }
    if (mode === 'login') { await signInWithEmailAndPassword(auth, f.email, f.pw); r.push('/dashboard'); return; }
    if (f.pw !== f.pw2) throw { code: 'x' }; if (!f.terms) throw { code: 'x' };
    const c = await createUserWithEmailAndPassword(auth, f.email, f.pw); await updateProfile(c.user, { displayName: f.name });
    await api('/api/auth/init', { method: 'POST', body: JSON.stringify({ fullName: f.name, company: f.company }) }); await sendEmailVerification(c.user); r.push('/dashboard'); }); };
  return <><Header /><div className="authgrid"><aside className="authside"><LogoMark s={44} /><h2 style={{ fontSize: 34, color: '#fff' }}>Encaissez par carte, retirez en crypto.</h2><p>Un compte gratuit, une API claire et un registre comptable fiable.</p><ul className="ck" style={{ color: '#fff' }}>{['2 essais gratuits en mode test', 'Paiements vérifiés côté serveur', 'Retraits en USDT contrôlés'].map(x => <li key={x} style={{ color: '#D8E2F0' }}><Check size={18} color="#7FB0FF" />{x}</li>)}</ul></aside><div className="authform"><div><h1 style={{ fontSize: 30, marginBottom: 6 }}>{mode === 'login' ? 'Connexion' : mode === 'register' ? 'Créer un compte' : 'Mot de passe oublié'}</h1><p className="mut">{mode === 'login' ? 'Heureux de vous revoir.' : mode === 'register' ? 'Gratuit, sans engagement.' : 'Nous vous envoyons un lien de réinitialisation.'}</p>
    <form onSubmit={submit}>
      {mode === 'register' && <><label htmlFor="n">Nom complet</label><input id="n" className="in" required minLength={2} value={f.name} onChange={set('name')} autoComplete="name" /><label htmlFor="co">Nom de l’entreprise</label><input id="co" className="in" required value={f.company} onChange={set('company')} autoComplete="organization" /></>}
      <label htmlFor="e">Adresse email</label><input id="e" className="in" type="email" required value={f.email} onChange={set('email')} autoComplete="email" />
      {mode !== 'forgot' && <><label htmlFor="p">Mot de passe</label><input id="p" className="in" type="password" required minLength={8} value={f.pw} onChange={set('pw')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></>}
      {mode === 'register' && <><label htmlFor="p2">Confirmer le mot de passe</label><input id="p2" className="in" type="password" required value={f.pw2} onChange={set('pw2')} autoComplete="new-password" />
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}><input type="checkbox" checked={f.terms} onChange={set('terms')} required style={{ marginTop: 4 }} /><span>J’accepte les <Link href="/terms">conditions d’utilisation</Link> et la <Link href="/privacy">politique de confidentialité</Link>.</span></label></>}
      {mode === 'register' && f.pw2 && f.pw !== f.pw2 && <div className="err">Les mots de passe ne correspondent pas.</div>}
      {err && <div className="err" role="alert">{err}</div>}{ok && <div className="okm">{ok}</div>}
      <button className="btn p" style={{ width: '100%', justifyContent: 'center', marginTop: 14 }} disabled={busy}>{busy ? 'Patientez…' : mode === 'login' ? 'Se connecter' : mode === 'register' ? 'Créer mon compte' : 'Envoyer le lien'}</button></form>
    {mode !== 'forgot' && <div style={{ display: 'grid', gap: 10, marginTop: 14 }}><button className="btn" style={{ minHeight: 46 }} onClick={() => social(GoogleAuthProvider)} disabled={busy}>Continuer avec Google</button><button className="btn" style={{ minHeight: 46 }} onClick={() => social(GithubAuthProvider)} disabled={busy}>Continuer avec GitHub</button></div>}
    <p className="mut" style={{ marginTop: 16 }}>{mode === 'login' ? <><Link href="/forgot-password">Mot de passe oublié ?</Link> · <Link href="/register">Créer un compte</Link></> : <Link href="/login">Déjà un compte ? Connexion</Link>}</p></div></div></div></>;
}
