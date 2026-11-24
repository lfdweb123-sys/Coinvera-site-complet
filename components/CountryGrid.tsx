'use client';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { CONTINENTS, COUNTRY_TOTAL } from '@/lib/countries';
// Liste des pays par continent, avec une recherche : tout est rendu côté serveur (indexable) et filtré côté client.
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export default function CountryGrid() {
  const [q, setQ] = useState(''); const n = norm(q.trim());
  const groups = CONTINENTS.map(c => ({ ...c, list: n ? c.countries.filter(x => norm(x).includes(n)) : c.countries })).filter(c => c.list.length);
  const found = groups.reduce((t, c) => t + c.list.length, 0);
  return <div>
    <div className="cv-search"><Search size={18} aria-hidden="true" /><input className="in" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un pays" aria-label="Rechercher un pays" /></div>
    <p className="mut" role="status" aria-live="polite" style={{ margin: '0 0 24px' }}>{n ? `${found} résultat${found > 1 ? 's' : ''}` : `${COUNTRY_TOTAL} pays, sur tous les continents`}</p>
    {groups.map(c => <section key={c.id} id={c.id} className="cv-cont"><h3>{c.name} <span className="mut">· {c.list.length}</span></h3><ul className="cv-grid">{c.list.map(x => <li key={x}>{x}</li>)}</ul></section>)}
    {!groups.length && <p className="mut">Aucun pays ne correspond à votre recherche.</p>}
  </div>;
}
