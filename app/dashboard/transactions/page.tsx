'use client';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { useData } from '@/lib/client';
import { Badge, day, PageHead, usd } from '@/components/Bits';
import DataTable from '@/components/DataTable';
export default function Tx() {
  const { data, loading, error } = useData('/api/transactions');
  const [q, setQ] = useState(''), [st, setSt] = useState(''), [from, setFrom] = useState(''), [to, setTo] = useState(''), [open, setOpen] = useState<any>(null);
  const items = (data?.items ?? []).filter((x: any) => (!st || x.status === st) && (!q || (x.id + x.title + (x.orderRef ?? '')).toLowerCase().includes(q.toLowerCase())) && (!from || x.createdAt >= from) && (!to || x.createdAt <= to + 'T23:59'));
  return <div className="stack"><PageHead title="Transactions" sub="Tous vos paiements, avec le détail des commissions." />{error && <div className="err">{error}</div>}
    <DataTable loading={loading} rows={items} empty="Aucune transaction" emptyHint="Les paiements apparaîtront ici." toolbar={<><div style={{ position: 'relative', flex: '1 1 220px' }}><Search size={16} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--mut)' }} /><input className="in" style={{ paddingLeft: 34, maxWidth: 'none' }} placeholder="Rechercher (id, titre, commande)" value={q} onChange={e => setQ(e.target.value)} aria-label="Recherche" /></div>
      <select className="in" value={st} onChange={e => setSt(e.target.value)} aria-label="Statut"><option value="">Tous les statuts</option>{['pending', 'confirmed', 'failed', 'expired'].map(s => <option key={s}>{s}</option>)}</select>
      <input className="in" type="date" value={from} onChange={e => setFrom(e.target.value)} aria-label="Du" style={{ maxWidth: 160 }} /><input className="in" type="date" value={to} onChange={e => setTo(e.target.value)} aria-label="Au" style={{ maxWidth: 160 }} /></>}
      cols={[{ key: 'title', label: 'Transaction', render: r => <button style={{ background: 'none', border: 0, padding: 0, font: 'inherit', textAlign: 'left', cursor: 'pointer', color: 'var(--brand)' }} onClick={() => setOpen(r)}>{r.title}</button> }, { key: 'createdAt', label: 'Date', render: r => day(r.createdAt) }, { key: 'amount', label: 'Montant', right: true, num: true, render: r => usd(r.amount) },
        { key: 'fees', label: 'Commission', right: true, num: true, render: r => r.fees ? usd(r.fees.total) : '—' }, { key: 'net', label: 'Net', right: true, num: true, render: r => usd(r.net) }, { key: 'status', label: 'Statut', render: r => <Badge s={r.status} /> }]} />
    {open && <div className="card"><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><h3>Détail de la transaction</h3><button className="btn sm" onClick={() => setOpen(null)}>Fermer</button></div>
      <p className="mut" style={{ marginTop: 8 }}>ID {open.id} · mode {open.mode} · commande {open.orderRef ?? '—'}</p>
      {open.fees ? <div className="twrap"><table className="tbl"><tbody>{[['Montant payé', open.amount], ['Frais de traitement', open.fees.processing], ['Frais de plateforme', open.fees.platform], ['Commission totale', open.fees.total], ['Net crédité', open.net]].map(([l, v]) => <tr key={l as string}><td data-label="">{l}</td><td className="r num" data-label="">{usd(v as string)}</td></tr>)}</tbody></table></div> : <p className="mut">Les frais seront détaillés après confirmation.</p>}</div>}</div>;
}
