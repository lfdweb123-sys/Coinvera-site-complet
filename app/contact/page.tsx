'use client';
import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Clock, LifeBuoy, RefreshCw, Activity } from 'lucide-react';
import { Header, Footer } from '@/components/Site';
import PageHero from '@/components/PageHero';
import { DOCS, STATUS } from '@/lib/site';
const CATS = ['Support technique', 'Paiement', 'Retrait', 'API', 'WooCommerce', 'Compte', 'Autre'];
export default function Contact() {
  const [f, setF] = useState({ name: '', email: '', subject: '', category: 'Support technique', message: '', website: '' }), [cap, setCap] = useState({ question: '…', token: '' }), [ans, setAns] = useState(''), [s, setS] = useState<'' | 'ok' | 'busy'>(''), [err, setErr] = useState('');
  const load = useCallback(async () => { try { setCap(await (await fetch('/api/captcha', { cache: 'no-store' })).json()); setAns(''); } catch {} }, []); useEffect(() => { load(); }, [load]);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setS('busy');
    const r = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, captchaToken: cap.token, captchaAnswer: ans }) });
    if (r.ok) { setS('ok'); return; } const j = await r.json().catch(() => ({})); setS('');
    setErr(j.error === 'captcha_invalid' ? 'Réponse au calcul incorrecte ou expirée. Réessayez.' : j.error === 'rate_limited' ? 'Trop de messages envoyés. Réessayez plus tard.' : 'L’envoi a échoué. Vérifiez les champs et réessayez.'); load();
  }
  return <><Header /><PageHero v={1} eyebrow="Contact" title="Une question ? Écrivez-nous" sub="Notre équipe vous répond par email dans les meilleurs délais." />
    <main className="sec"><div className="wrap cgrid"><div className="stack" style={{ gridTemplateRows: 'repeat(3,1fr)' }}>
      {[[LifeBuoy, 'Support', 'Paiement, retrait, API ou compte : choisissez la catégorie qui correspond à votre demande.', ['mailto:support@coinver.me', 'support@coinver.me']], [BookOpen, 'Documentation', 'Guides, exemples de code et référence de l’API.', [DOCS, 'Ouvrir la documentation']], [Activity, 'État des services', 'Consultez la disponibilité en temps réel.', [STATUS, 'Voir l’état des services']]].map(([I, t, d, l]: any) => <div className="card feat" key={t}><div className="ic"><I size={22} /></div><h3>{t}</h3><p>{d}</p>{l && <p style={{ margin: '10px 0 0' }}><a href={l[0]}>{l[1]}{l[0].startsWith('mailto:') ? '' : ' →'}</a></p>}</div>)}</div>
      <div className="card">{s === 'ok' ? <div className="empty"><div className="ic" style={{ background: 'var(--oksoft)', color: 'var(--ok)' }}><Clock size={22} /></div><b>Message envoyé</b>Merci ! Vous allez recevoir une confirmation par email et nous vous répondrons rapidement.</div> :
        <form onSubmit={submit}><h2 style={{ fontSize: 26, marginBottom: 4 }}>Envoyer un message</h2><p className="mut">Tous les champs sont obligatoires.</p>
          <div className="g2"><div><label htmlFor="name">Nom</label><input id="name" className="in" required minLength={2} value={f.name} onChange={set('name')} autoComplete="name" /></div><div><label htmlFor="email">Email</label><input id="email" className="in" type="email" required value={f.email} onChange={set('email')} autoComplete="email" /></div></div>
          <div className="g2"><div><label htmlFor="subject">Sujet</label><input id="subject" className="in" required minLength={3} value={f.subject} onChange={set('subject')} /></div><div><label htmlFor="cat">Catégorie</label><select id="cat" className="in" value={f.category} onChange={set('category')}>{CATS.map(c => <option key={c}>{c}</option>)}</select></div></div>
          <label htmlFor="msg">Message</label><textarea id="msg" className="in" rows={6} required minLength={10} value={f.message} onChange={set('message')} />
          <input tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: -9999 }} value={f.website} onChange={set('website')} />
          <label htmlFor="cap">Vérification anti-spam : combien font <b style={{ color: 'var(--brand)', fontSize: 17 }}>{cap.question}</b> ?</label>
          <div style={{ display: 'flex', gap: 10 }}><input id="cap" className="in" inputMode="numeric" required value={ans} onChange={e => setAns(e.target.value.replace(/[^0-9-]/g, ''))} placeholder="Votre réponse" style={{ maxWidth: 200 }} /><button type="button" className="btn" onClick={load} aria-label="Nouveau calcul"><RefreshCw size={16} /></button></div>
          {err && <div className="err" role="alert">{err}</div>}<button className="btn p lg full" style={{ marginTop: 18 }} disabled={s === 'busy' || !cap.token}>{s === 'busy' ? 'Envoi…' : 'Envoyer le message'}</button></form>}</div></div></main><Footer /></>;
}
