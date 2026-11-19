'use client';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api, msg, useData } from '@/lib/client';
import { day, PageHead } from '@/components/Bits';
import DataTable from '@/components/DataTable';
import { useConfirm } from '@/components/Confirm';
export default function Audit() {
  const { data, loading, reload } = useData('/api/admin/list?c=audit_logs'); const me = useData('/api/me'); const ask = useConfirm();
  const [sel, setSel] = useState<Set<string>>(new Set()), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const items: any[] = data?.items ?? []; const isSuper = !!me.data?.superAdmin; const allOn = items.length > 0 && sel.size === items.length;
  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  async function del(body: object) { setBusy(true); setErr(''); try { await api('/api/admin/audit-logs', { method: 'DELETE', body: JSON.stringify(body) }); setSel(new Set()); reload(); } catch (e) { setErr(msg(e)); } setBusy(false); }
  async function delSel() { if (!(await ask({ title: `Supprimer ${sel.size} entrée(s) ?`, message: 'Cette action est définitive.', confirmLabel: 'Supprimer', danger: true }))) return; const ids = [...sel]; for (let i = 0; i < ids.length; i += 500) await del({ ids: ids.slice(i, i + 500) }); }
  async function delOne(id: string) { if (await ask({ title: 'Supprimer cette entrée ?', message: 'Cette action est définitive.', confirmLabel: 'Supprimer', danger: true })) await del({ ids: [id] }); }
  async function delAll() { if (await ask({ title: 'Vider tout le journal d’audit ?', message: 'Toutes les entrées seront supprimées définitivement. Une trace de cette purge est conservée.', confirmLabel: 'Tout supprimer', danger: true })) await del({ all: true }); }
  const cols: any[] = [...(isSuper ? [{ key: 'sel', label: '', head: <input type="checkbox" aria-label="Tout sélectionner" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(items.map(i => i.id)))} style={{ width: 18, height: 18 }} />, render: (r: any) => <input type="checkbox" aria-label="Sélectionner" checked={sel.has(r.id)} onChange={() => toggle(r.id)} style={{ width: 18, height: 18 }} /> }] : []),
    { key: 'createdAt', label: 'Date', render: (r: any) => day(r.createdAt) }, { key: 'adminEmail', label: 'Administrateur', render: (r: any) => r.adminEmail || <code>{r.adminUid}</code> }, { key: 'action', label: 'Action', render: (r: any) => <code>{r.action}</code> },
    { key: 'details', label: 'Détails', render: (r: any) => <span className="mut" style={{ wordBreak: 'break-word' }}>{JSON.stringify(r.details ?? {}).slice(0, 160)}</span> },
    ...(isSuper ? [{ key: 'a', label: '', right: true, render: (r: any) => <button className="btn sm d" aria-label="Supprimer" onClick={() => delOne(r.id)}><Trash2 size={14} /></button> }] : [])];
  return <div className="stack"><PageHead title="Journal d’audit" sub="Historique des opérations d’administration." />{err && <div className="err">{err}</div>}
    <DataTable loading={loading} rows={items} empty="Journal vide" cols={cols} pageSize={15} toolbar={isSuper ? <><span className="mut">{sel.size} sélectionnée(s) sur {items.length}</span><div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="btn sm d" disabled={!sel.size || busy} onClick={delSel}><Trash2 size={14} />Supprimer la sélection</button><button className="btn sm d" disabled={!items.length || busy} onClick={delAll}>Tout supprimer</button></div></> : undefined} /></div>;
}
