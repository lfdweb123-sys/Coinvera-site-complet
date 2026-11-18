'use client';
import { useMemo, useState } from 'react';
import { Search, LifeBuoy } from 'lucide-react';
import { ARTICLES, CATS } from '@/lib/help';
export default function HelpCenter() {
  const [q, setQ] = useState(''), [cat, setCat] = useState('');
  const list = useMemo(() => ARTICLES.filter(a => (!cat || a.cat === cat) && (a.q + a.a).toLowerCase().includes(q.toLowerCase())), [q, cat]);
  return <><div style={{ maxWidth: 640, marginTop: -26, position: 'relative', zIndex: 3 }}><div style={{ position: 'relative' }}><Search size={20} style={{ position: 'absolute', left: 18, top: 18, color: 'var(--mut)' }} /><input className="in" style={{ paddingLeft: 48, minHeight: 56, borderRadius: 14, boxShadow: 'var(--sh)' }} placeholder="Rechercher dans l’aide…" value={q} onChange={e => setQ(e.target.value)} aria-label="Rechercher dans l’aide" /></div></div>
    <div className="g3" style={{ margin: '36px 0' }}>{CATS.map(([c, d]) => <button key={c} className={'card hcat' + (cat === c ? ' on' : '')} style={cat === c ? { borderColor: 'var(--brand)' } : undefined} onClick={() => setCat(cat === c ? '' : c)}><div className="ic" style={{ margin: 0 }}><LifeBuoy size={22} /></div><div><h3 style={{ fontSize: 18 }}>{c}</h3><p className="mut" style={{ margin: '4px 0 0' }}>{d}</p></div></button>)}</div>
    <h2 style={{ fontSize: 26, marginBottom: 16 }}>{cat || 'Toutes les questions'}</h2>
    {list.length ? list.map(a => <details className="faq" key={a.q}><summary>{a.q}</summary><p>{a.a}</p></details>) : <div className="empty"><b>Aucun résultat</b>Essayez d’autres mots-clés ou contactez le support.</div>}</>;
}
