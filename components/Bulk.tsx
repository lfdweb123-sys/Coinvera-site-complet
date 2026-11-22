'use client';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api, msg, useData } from '@/lib/client';
import { useConfirm } from '@/components/Confirm';
import type { Col } from '@/components/DataTable';
const REASON: Record<string, string> = { withdrawal_in_progress: 'retrait non terminé', order_in_progress: 'commande en cours', balance_not_zero: 'solde non nul', protected_admin: 'compte protégé', error: 'erreur' };
// Suppression à l'unité et en masse pour les listes admin. Réservée à l'administrateur principal (contrôlé aussi côté serveur) ; le serveur refuse les lignes qui portent de l'argent en cours.
// Usage : const bulk = useBulk({ c: 'transactions', rows, reload }) puis cols={[...bulk.pre, ...cols, ...bulk.post]} et toolbar={<>{…}{bulk.toolbar}</>}.
export function useBulk({ c, rows, reload, canDelete, remove, label = 'ligne', danger }: { c: string; rows: any[]; reload: () => void; canDelete?: (r: any) => boolean; remove?: (ids: string[]) => Promise<void>; label?: string; danger?: string }) {
  const me = useData('/api/me'); const ask = useConfirm(); const on = !!me.data?.superAdmin;
  const [sel, setSel] = useState<Set<string>>(new Set()), [busy, setBusy] = useState(false), [err, setErr] = useState(''), [info, setInfo] = useState('');
  const ok = (r: any) => !canDelete || canDelete(r); const all = rows.filter(ok).map(r => r.id as string); const live = [...sel].filter(id => all.includes(id));
  const allOn = all.length > 0 && live.length === all.length;
  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  async function run(ids: string[]) {
    setBusy(true); setErr(''); setInfo(''); let deleted = 0; const skipped: { id: string; reason: string }[] = [];
    try {
      if (remove) { await remove(ids); deleted = ids.length; }
      else for (let i = 0; i < ids.length; i += 500) { const r = await api('/api/admin/records', { method: 'DELETE', body: JSON.stringify({ c, ids: ids.slice(i, i + 500) }) }); deleted += r.deleted ?? 0; skipped.push(...(r.skipped ?? [])); }
      setInfo(`${deleted} supprimée(s)` + (skipped.length ? ` · ${skipped.length} conservée(s) (${[...new Set(skipped.map(s => REASON[s.reason] ?? s.reason))].join(', ')})` : '')); setSel(new Set()); reload();
    } catch (e) { setErr(msg(e)); reload(); }
    setBusy(false);
  }
  const confirm = (ids: string[], title: string, message: string, label2: string) => ask({ title, message: [message, danger].filter(Boolean).join(' '), confirmLabel: label2, danger: true }).then(async y => { if (y) await run(ids); });
  const delSel = () => confirm(live, `Supprimer ${live.length} ${label}(s) ?`, 'Cette action est définitive et enregistrée dans le journal d’audit.', 'Supprimer');
  const delAll = () => confirm(all, `Supprimer les ${all.length} ${label}(s) de cette liste ?`, 'Toute la liste affichée sera supprimée définitivement ; les lignes qui portent de l’argent en cours sont conservées.', 'Tout supprimer');
  const delOne = (id: string) => confirm([id], `Supprimer cette ${label} ?`, 'Cette action est définitive et enregistrée dans le journal d’audit.', 'Supprimer');
  const box = { width: 18, height: 18 } as const;
  const pre: Col[] = on ? [{ key: '_sel', label: 'Sélection', head: <input type="checkbox" aria-label="Tout sélectionner" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(all))} style={box} />, render: r => ok(r) ? <input type="checkbox" aria-label="Sélectionner" checked={sel.has(r.id)} onChange={() => toggle(r.id)} style={box} /> : null }] : [];
  const post: Col[] = on ? [{ key: '_del', label: '', right: true, render: r => ok(r) ? <button className="btn sm d" aria-label="Supprimer" disabled={busy} onClick={() => delOne(r.id)}><Trash2 size={14} /></button> : null }] : [];
  const toolbar = on ? <><span className="mut">{live.length} sélectionnée(s) sur {all.length}</span><div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="btn sm d" disabled={!live.length || busy} onClick={delSel}><Trash2 size={14} />Supprimer la sélection</button><button className="btn sm d" disabled={!all.length || busy} onClick={delAll}>Tout supprimer</button></div></> : null;
  const status = (err || info) ? <div className={err ? 'err' : 'okm'} role={err ? 'alert' : 'status'}>{err || info}</div> : null;
  return { on, pre, post, toolbar, status, sel, live, all, busy, delOne, delSel, toggle, clear: () => setSel(new Set()), selectAll: () => setSel(new Set(all)) };
}
