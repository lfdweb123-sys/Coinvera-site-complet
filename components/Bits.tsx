'use client';
import { useState } from 'react';
import { Inbox } from 'lucide-react';
export const Badge = ({ s }: { s: string }) => {
  const k = ['confirmed', 'completed', 'active', 'Resolved', 'Closed', 'live'].includes(s) ? 'ok' : ['failed', 'rejected', 'expired', 'revoked', 'suspended'].includes(s) ? 'bad' : ['needs_review', 'pending_admin', 'New', 'pending', 'queued'].includes(s) ? 'warn' : ['processing', 'broadcasted', 'Open', 'In Progress', 'test'].includes(s) ? 'info' : '';
  return <span className={'badge ' + k}>{({ pending_admin: 'À valider' } as Record<string, string>)[s] ?? s}</span>;
};
export const Stat = ({ label, value, icon: I }: { label: string; value: React.ReactNode; icon?: any }) => <div className="card stat">{I && <div className="ic"><I size={22} /></div>}<div><small>{label}</small><b>{value}</b></div></div>;
export const Empty = ({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) => <div className="empty"><div className="ic"><Inbox size={22} /></div><b>{title}</b><div>{hint}</div>{children && <div style={{ marginTop: 16 }}>{children}</div>}</div>;
export const PageHead = ({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) => <div className="phead"><div><h1>{title}</h1>{sub && <p>{sub}</p>}</div><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{children}</div></div>;
export function Copy({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return <button className="btn sm" onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); }}>{ok ? 'Copié' : 'Copier'}</button>;
}
export const usd = (s?: string | number | null) => s == null || s === '' || isNaN(Number(s)) ? '—' : Number(s).toLocaleString('fr-FR', { style: 'currency', currency: 'USD' });
export const day = (s?: string) => s ? new Date(s).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
