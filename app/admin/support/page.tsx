'use client';
import { useState } from 'react';
import { api, Skel, useData } from '@/lib/client';
import { Badge, day, PageHead } from '@/components/Bits';
const ST = ['New', 'Open', 'In Progress', 'Waiting for Customer', 'Resolved', 'Closed'];
export default function S() {
  const { data, loading, reload } = useData('/api/admin/list?c=support_tickets'); const [f, setF] = useState(''), [q, setQ] = useState(''), [open, setOpen] = useState<string | null>(null), [r, setR] = useState('');
  const items = (data?.items ?? []).filter((t: any) => (!f || t.status === f) && (t.subject + t.email + t.message).toLowerCase().includes(q.toLowerCase()));
  const up = async (id: string, b: object) => { await api('/api/admin/tickets', { method: 'PATCH', body: JSON.stringify({ id, ...b }) }); setR(''); reload(); };
  return <div className="stack"><PageHead title="Tickets support" sub="Répondez par email et suivez les statuts." /><div className="grid"><input className="in" placeholder="Rechercher" value={q} onChange={e => setQ(e.target.value)} aria-label="Recherche" />
    <select className="in" value={f} onChange={e => setF(e.target.value)} aria-label="Statut"><option value="">Tous</option>{ST.map(s => <option key={s}>{s}</option>)}</select></div>
    <div className="card pad0">{loading ? <div style={{ padding: 18 }}><Skel /></div> : items.map((t: any) => <div key={t.id} style={{ borderBottom: '1px solid var(--line)', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, cursor: 'pointer', flexWrap: 'wrap' }} onClick={() => setOpen(open === t.id ? null : t.id)}><span><b>{t.subject}</b> <span className="mut">· {t.category} · {t.email} · {day(t.createdAt)}</span></span><Badge s={t.status} /></div>
      {open === t.id && <div style={{ marginTop: 12 }}><p style={{ whiteSpace: 'pre-wrap' }}>{t.message}</p>{(t.replies ?? []).map((x: any, i: number) => <p key={i} className="mut">↳ {x.text}</p>)}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><select className="in" style={{ width: 200 }} value={t.status} onChange={e => up(t.id, { status: e.target.value })} aria-label="Changer le statut">{ST.map(s => <option key={s}>{s}</option>)}</select>
          <select className="in" style={{ width: 140 }} value={t.priority} onChange={e => up(t.id, { priority: e.target.value })} aria-label="Priorité">{['low', 'normal', 'high'].map(s => <option key={s}>{s}</option>)}</select></div>
        <textarea className="in" rows={3} placeholder="Répondre (envoyé par email)" value={r} onChange={e => setR(e.target.value)} style={{ marginTop: 10 }} /><button className="btn p" style={{ marginTop: 8 }} disabled={!r} onClick={() => up(t.id, { reply: r })}>Envoyer la réponse</button></div>}</div>)}</div></div>;
}
