'use client';
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Empty } from '@/components/Bits';
export type Col = { key: string; label: string; head?: React.ReactNode; render?: (r: any) => React.ReactNode; right?: boolean; num?: boolean };
export default function DataTable({ cols, rows, loading, empty, emptyHint, toolbar, pageSize = 10, server }: { cols: Col[]; rows: any[]; loading?: boolean; empty: string; emptyHint?: string; toolbar?: React.ReactNode; pageSize?: number; server?: { total: number; page: number; size: number; onPage: (p: number) => void } }) {
  const [p, setP] = useState(0); const total = server ? server.total : rows.length; const size = server ? server.size : pageSize; const pages = Math.max(1, Math.ceil(total / size)); const pg = server ? server.page - 1 : Math.min(p, pages - 1); const slice = server ? rows : rows.slice(pg * size, pg * size + size); const go = (n: number) => server ? server.onPage(n + 1) : setP(n);
  return <div className="card pad0">{toolbar && <div className="tbar">{toolbar}</div>}
    {loading ? <div style={{ padding: 20, display: 'grid', gap: 14 }}>{[0, 1, 2, 3].map(i => <div key={i} className="skel" style={{ height: 22, width: `${90 - i * 8}%` }} />)}</div> : !total && !rows.length ? <Empty title={empty} hint={emptyHint} /> : <>
      <div className="twrap"><table className="tbl"><thead><tr>{cols.map(c => <th key={c.key} className={c.right ? 'r' : ''}>{c.head ?? c.label}</th>)}</tr></thead>
        <tbody>{slice.map((r, i) => <tr key={r.id ?? i}>{cols.map(c => <td key={c.key} data-label={c.label} className={(c.right ? 'r ' : '') + (c.num ? 'num' : '')}>{c.render ? c.render(r) : String(r[c.key] ?? '—')}</td>)}</tr>)}</tbody></table></div>
      <div className="pager"><span>{total} résultat{total > 1 ? 's' : ''} · page {pg + 1}/{pages}</span><span style={{ display: 'flex', gap: 6 }}><button className="btn sm" aria-label="Page précédente" disabled={pg === 0} onClick={() => go(pg - 1)}><ChevronLeft size={16} /></button><button className="btn sm" aria-label="Page suivante" disabled={pg >= pages - 1} onClick={() => go(pg + 1)}><ChevronRight size={16} /></button></span></div></>}</div>;
}
