'use client';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { api, useData } from '@/lib/client';
import { Badge, day, PageHead } from '@/components/Bits';
import DataTable from '@/components/DataTable';
import { useBulk } from '@/components/Bulk';
export default function M() {
  const { data, loading, reload } = useData('/api/admin/list?c=merchants'); const [q, setQ] = useState('');
  const items = (data?.items ?? []).filter((m: any) => (m.email + m.fullName + m.company + m.merchantCode).toLowerCase().includes(q.toLowerCase()));
  const bulk = useBulk({ c: 'merchants', rows: items, reload, label: 'compte marchand', suspend: true, danger: 'Le compte, ses clés API et son accès sont supprimés ; un compte dont le solde n’est pas nul est conservé.' });
  return <div className="stack"><PageHead title="Marchands" sub="Comptes, statuts et suspensions." />{bulk.status}
    <DataTable loading={loading} rows={items} empty="Aucun marchand" toolbar={<><div style={{ position: 'relative', flex: '1 1 240px' }}><Search size={16} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--mut)' }} /><input className="in" style={{ paddingLeft: 34, maxWidth: 'none' }} placeholder="Rechercher" value={q} onChange={e => setQ(e.target.value)} aria-label="Recherche" /></div>{bulk.toolbar}</>}
      cols={[...bulk.pre, { key: 'fullName', label: 'Marchand', render: m => <><b>{m.fullName}</b><div className="mut">{m.email}</div></> }, { key: 'company', label: 'Entreprise' }, { key: 'merchantCode', label: 'ID', render: m => <code>{m.merchantCode}</code> }, { key: 'createdAt', label: 'Inscrit', render: m => day(m.createdAt) }, { key: 'status', label: 'Statut', render: m => <Badge s={m.status} /> },
        { key: 'a', label: '', right: true, render: m => <button className={'btn sm' + (m.status === 'active' ? ' d' : '')} onClick={async () => { await api('/api/admin/merchants/' + m.id, { method: 'PATCH', body: JSON.stringify({ status: m.status === 'active' ? 'suspended' : 'active' }) }); reload(); }}>{m.status === 'active' ? 'Suspendre' : 'Réactiver'}</button> }, ...bulk.post]} /></div>;
}
