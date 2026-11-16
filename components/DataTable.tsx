'use client';
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Empty } from '@/components/Bits';
export type Col = { key: string; label: string; render?: (r: any) => React.ReactNode; right?: boolean; num?: boolean };
export default function DataTable({ cols, rows, loading, empty, emptyHint, toolbar, pageSize = 10 }: { cols: Col[]; rows: any[]; loading?: boolean; empty: string; emptyHint?: string; toolbar?: React.ReactNode; pageSize?: number }) {
  const [p, setP] = useState(0); const pages = Math.max(1, Math.ceil(rows.length / pageSize)); const pg = Math.min(p, pages - 1); const slice = rows.slice(pg * pageSize, pg * pageSize + pageSize);
  return <div className="card pad0">{toolbar && <div className="tbar">{toolbar}</div>}
    {loading ? <div style={{ padding: 20, display: 'grid', gap: 14 }}>{[0, 1, 2, 3].map(i => <div key={i} className="skel" style={{ height: 22, width: `${90 - i * 8}%` }} />)}</div> : !rows.length ? <Empty title={empty} hint={emptyHint} /> : <>
      <div className="twrap"><table className="tbl"><thead><tr>{cols.map(c => <th key={c.key} className={c.right ? 'r' : ''}>{c.label}</th>)}</tr></thead>
        <tbody>{slice.map((r, i) => <tr key={r.id ?? i}>{cols.map(c => <td key={c.key} data-label={c.label} className={(c.right ? 'r ' : '') + (c.num ? 'num' : '')}>{c.render ? c.render(r) : String(r[c.key] ?? '—')}</td>)}</tr>)}</tbody></table></div>
      <div className="pager"><span>{rows.length} résultat{rows.length > 1 ? 's' : ''} · page {pg + 1}/{pages}</span><span style={{ display: 'flex', gap: 6 }}><button className="btn sm" aria-label="Page précédente" disabled={pg === 0} onClick={() => setP(pg - 1)}><ChevronLeft size={16} /></button><button className="btn sm" aria-label="Page suivante" disabled={pg >= pages - 1} onClick={() => setP(pg + 1)}><ChevronRight size={16} /></button></span></div></>}</div>;
}
