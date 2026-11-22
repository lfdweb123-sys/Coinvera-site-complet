'use client';
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useData } from '@/lib/client';
import { PageHead } from '@/components/Bits';
import DataTable from '@/components/DataTable';
import { useBulk } from '@/components/Bulk';
const flag = (c?: string) => c && /^[A-Z]{2}$/.test(c) ? String.fromCodePoint(...[...c].map(x => 127397 + x.charCodeAt(0))) + ' ' : '';
const when = (t?: number) => t ? new Date(t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
export default function Connexions() {
  const { data, loading, error, reload } = useData('/api/admin/list?c=connections');
  const all: any[] = data?.items ?? []; const [q, setQ] = useState(''), [week, setWeek] = useState(''), [role, setRole] = useState('');
  const weeks = useMemo(() => [...new Set(all.map(r => r.week))].sort().reverse(), [all]);
  const rows = all.filter(r => (!week || r.week === week) && (!role || r.role === role) && [r.email, r.name, r.ip, r.city, r.country, r.browser, r.os, r.method, ...(r.ips ?? [])].join(' ').toLowerCase().includes(q.toLowerCase()));
  const bulk = useBulk({ c: 'connections', rows, reload, label: 'connexion' });
  const people = new Set(rows.map(r => r.uid)).size, countries = new Set(rows.map(r => r.country).filter(Boolean)).size;
  return <div className="stack"><PageHead title="Connexions" sub="Une ligne par personne et par semaine : adresse IP, lieu, appareil et méthode de connexion, mises à jour à chaque visite de la semaine." />
    {error && <div className="err">{error}</div>}{bulk.status}
    <DataTable loading={loading} rows={rows} empty="Aucune connexion enregistrée" emptyHint="Les connexions apparaissent dès que les utilisateurs ouvrent leur espace." pageSize={15}
      toolbar={<><div style={{ position: 'relative', flex: '1 1 240px' }}><Search size={16} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--mut)' }} /><input className="in" style={{ paddingLeft: 34, maxWidth: 'none' }} placeholder="Rechercher (e-mail, IP, ville, pays…)" value={q} onChange={e => setQ(e.target.value)} aria-label="Recherche" /></div>
        <select className="in" style={{ width: 'auto' }} value={week} onChange={e => setWeek(e.target.value)} aria-label="Semaine"><option value="">Toutes les semaines</option>{weeks.map(w => <option key={w}>{w}</option>)}</select>
        <select className="in" style={{ width: 'auto' }} value={role} onChange={e => setRole(e.target.value)} aria-label="Profil"><option value="">Tous les profils</option><option value="merchant">Marchands</option><option value="admin">Administrateurs</option></select>
        <span className="mut">{people} personne(s) · {countries} pays</span>{bulk.toolbar}</>}
      cols={[...bulk.pre, { key: 'week', label: 'Semaine', render: r => <code>{r.week}</code> },
        { key: 'name', label: 'Personne', render: r => <><b>{r.name || '—'}</b><div className="mut" style={{ wordBreak: 'break-all' }}>{r.email}</div></> },
        { key: 'role', label: 'Profil', render: r => r.role === 'admin' ? 'Administrateur' : 'Marchand' },
        { key: 'ip', label: 'Adresse IP', render: r => <><code>{r.ip ?? '—'}</code>{(r.ips?.length ?? 0) > 1 && <div className="mut" style={{ fontSize: 12 }}>+{r.ips.length - 1} autre(s) : {r.ips.filter((x: string) => x !== r.ip).join(', ')}</div>}</> },
        { key: 'city', label: 'Lieu', render: r => r.city || r.country ? <>{flag(r.country)}{[r.city, r.region, r.country].filter(Boolean).join(', ')}</> : <span className="mut">Inconnu</span> },
        { key: 'browser', label: 'Appareil', render: r => <>{r.browser} · {r.os}<div className="mut" style={{ fontSize: 12 }}>{r.device}</div></> },
        { key: 'method', label: 'Connexion', render: r => r.method },
        { key: 'firstAt', label: 'Première / dernière', render: r => <><div>{when(r.firstAt)}</div><div className="mut" style={{ fontSize: 12 }}>{when(r.lastAt)}</div></> },
        { key: 'hits', label: 'Visites', right: true, num: true }, ...bulk.post]} /></div>;
}
