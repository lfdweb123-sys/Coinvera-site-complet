'use client';
import { useState } from 'react';
import { Header, Footer } from '@/components/Site';
import PageHero from '@/components/PageHero';
const CATS = ['Support technique', 'Paiement', 'Retrait', 'API', 'WooCommerce', 'Compte', 'Autre'];
export default function Contact() {
  const [f, setF] = useState({ name: '', email: '', subject: '', category: 'Support technique', message: '', website: '' }), [s, setS] = useState<'' | 'ok' | 'err' | 'busy'>('');
  return <><Header /><PageHero eyebrow="Contact" title="Une question ? Écrivez-nous" sub="Notre équipe vous répond rapidement." /><main className="wrap sec" style={{ maxWidth: 680, paddingTop: 40 }}>
    {s === 'ok' ? <div className="card"><h3>Message envoyé</h3><p className="mut">Merci ! Vous recevrez une confirmation par email et notre équipe vous répondra rapidement.</p></div> :
      <form className="card" onSubmit={async e => { e.preventDefault(); setS('busy'); const r = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) }); setS(r.ok ? 'ok' : 'err'); }}>
        {(['name', 'email', 'subject'] as const).map(k => <div key={k}><label htmlFor={k}>{{ name: 'Nom', email: 'Email', subject: 'Sujet' }[k]}</label><input id={k} className="in" required type={k === 'email' ? 'email' : 'text'} value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} /></div>)}
        <label htmlFor="cat">Catégorie</label><select id="cat" className="in" value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>{CATS.map(c => <option key={c}>{c}</option>)}</select>
        <label htmlFor="msg">Message</label><textarea id="msg" className="in" rows={6} required minLength={10} value={f.message} onChange={e => setF({ ...f, message: e.target.value })} />
        <input tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: -9999 }} value={f.website} onChange={e => setF({ ...f, website: e.target.value })} />
        {s === 'err' && <div className="err" role="alert">L’envoi a échoué. Vérifiez les champs ou réessayez plus tard.</div>}<button className="btn p" style={{ marginTop: 14 }} disabled={s === 'busy'}>{s === 'busy' ? 'Envoi…' : 'Envoyer'}</button></form>}</main><Footer /></>;
}
