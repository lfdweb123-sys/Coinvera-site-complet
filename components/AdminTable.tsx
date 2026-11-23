'use client';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { api, useData } from '@/lib/client';
import { useBulk } from '@/components/Bulk';
import { Badge, PageHead } from '@/components/Bits';
import DataTable from '@/components/DataTable';
const SKIP = ['merchantId', 'processorChargeId', 'replies', 'lines', 'adminUid'];
const fmt = (k: string, v: any) => v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : k === 'status' ? <Badge s={String(v)} /> : String(v);
export default function AdminTable({ c, title, sub }: { c: string; title: string; sub?: string }) {
  const { data, loading, error, reload } = useData('/api/admin/list?c=' + c); const [q, setQ] = useState('');
  const all: any[] = data?.items ?? []; const keys = all[0] ? Object.keys(all[0]).filter(k => !SKIP.includes(k)).slice(0, 7) : [];
  const rows = all.filter(r => JSON.stringify(r).toLowerCase().includes(q.toLowerCase()));
  const rev = c === 'api_keys' || c === 'woocommerce_licenses'; const bulk = useBulk({ c, rows, reload, revoke: rev, canRevoke: (r: any) => r.status !== 'revoked' });
  const revokeOne = async (id: string) => { await api('/api/admin/records', { method: 'POST', body: JSON.stringify({ c, ids: [id], action: 'revoke' }) }); reload(); };
  return <div className="stack"><PageHead title={title} sub={sub} />{error && <div className="err">{error}</div>}{bulk.status}
    <DataTable loading={loading} rows={rows} empty="Aucune donnée" cols={[...bulk.pre, ...keys.map(k => ({ key: k, label: k, render: (r: any) => <span style={{ display: 'inline-block', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>{fmt(k, r[k])}</span> })), ...(rev && bulk.on ? [{ key: '_rev', label: '', right: true, render: (r: any) => r.status !== 'revoked' ? <button className="btn sm d" onClick={() => revokeOne(r.id)}>Révoquer</button> : null }] : []), ...bulk.post]}
      toolbar={<><div style={{ position: 'relative', flex: '1 1 240px' }}><Search size={16} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--mut)' }} /><input className="in" style={{ paddingLeft: 34, maxWidth: 'none' }} placeholder="Rechercher" value={q} onChange={e => setQ(e.target.value)} aria-label="Recherche" /></div>{bulk.toolbar}</>} /></div>;
}
