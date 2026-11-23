'use client';
import { useState } from 'react';
import { Ban, RotateCcw, Trash2 } from 'lucide-react';
import { api, msg, useData } from '@/lib/client';
import { useConfirm } from '@/components/Confirm';
import type { Col } from '@/components/DataTable';
const REASON: Record<string, string> = { withdrawal_in_progress: 'retrait non terminé', order_in_progress: 'commande en cours', balance_not_zero: 'solde non nul', protected_admin: 'compte protégé', transaction_successful: 'transaction réussie', not_allowed: 'non autorisé', error: 'erreur' };
// Suppression / révocation à l'unité et en masse, pour les listes admin (`mine` absent) et pour les listes de l'utilisateur (`mine`).
// Admin : la suppression est réservée à l'administrateur principal (contrôlé aussi côté serveur) ; la révocation et la suspension sont ouvertes à tout administrateur.
// Utilisateur : uniquement ses propres lignes (propriété contrôlée côté serveur). Le serveur refuse toujours les lignes qui portent de l'argent en cours ou une transaction réussie.
// Usage : const bulk = useBulk({ c: 'transactions', rows, reload }) puis cols={[...bulk.pre, ...cols, ...bulk.post]} et toolbar={<>{…}{bulk.toolbar}</>}.
export function useBulk({ c, rows, reload, canDelete, canRevoke, remove, label = 'ligne', danger, mine, revoke, suspend }: { c: string; rows: any[]; reload: () => void; canDelete?: (r: any) => boolean; canRevoke?: (r: any) => boolean; remove?: (ids: string[]) => Promise<void>; label?: string; danger?: string; mine?: boolean; revoke?: boolean; suspend?: boolean }) {
  const me = useData('/api/me'); const ask = useConfirm(); const isAdmin = !!me.data?.admin;
  const delOn = !!mine || !!me.data?.superAdmin, actOn = (!!revoke || !!suspend) && (!!mine || isAdmin), on = delOn || actOn;
  const url = mine ? '/api/records' : '/api/admin/records';
  const [sel, setSel] = useState<Set<string>>(new Set()), [busy, setBusy] = useState(false), [err, setErr] = useState(''), [info, setInfo] = useState('');
  const okDel = (r: any) => delOn && (!canDelete || canDelete(r)); const okAct = (r: any) => actOn && (!canRevoke || canRevoke(r));
  const all = rows.filter(r => okDel(r) || okAct(r)).map(r => r.id as string); const live = [...sel].filter(id => all.includes(id));
  const delAllIds = rows.filter(okDel).map(r => r.id as string); const liveDel = live.filter(id => delAllIds.includes(id));
  const allOn = all.length > 0 && live.length === all.length;
  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const skippedText = (skipped: { reason: string }[]) => skipped.length ? ` · ${skipped.length} conservée(s) (${[...new Set(skipped.map(s => REASON[s.reason] ?? s.reason))].join(', ')})` : '';
  async function run(ids: string[]) {
    setBusy(true); setErr(''); setInfo(''); let deleted = 0; const skipped: { id: string; reason: string }[] = [];
    try {
      if (remove) { await remove(ids); deleted = ids.length; }
      else for (let i = 0; i < ids.length; i += 500) { const r = await api(url, { method: 'DELETE', body: JSON.stringify({ c, ids: ids.slice(i, i + 500) }) }); deleted += r.deleted ?? 0; skipped.push(...(r.skipped ?? [])); }
      setInfo(`${deleted} supprimée(s)` + skippedText(skipped)); setSel(new Set()); reload();
    } catch (e) { setErr(msg(e)); reload(); }
    setBusy(false);
  }
  async function act(ids: string[], action: 'revoke' | 'suspend' | 'reactivate') {
    setBusy(true); setErr(''); setInfo(''); let done = 0; const skipped: { id: string; reason: string }[] = [];
    try {
      for (let i = 0; i < ids.length; i += 500) { const r = await api(url, { method: 'POST', body: JSON.stringify({ c, ids: ids.slice(i, i + 500), action }) }); done += (mine ? r.revoked : r.done) ?? 0; skipped.push(...(r.skipped ?? [])); }
      setInfo(`${done} ${action === 'revoke' ? 'révoquée(s)' : action === 'suspend' ? 'suspendue(s)' : 'réactivée(s)'}` + skippedText(skipped)); setSel(new Set()); reload();
    } catch (e) { setErr(msg(e)); reload(); }
    setBusy(false);
  }
  const final = mine ? 'Cette action est définitive.' : 'Cette action est définitive et enregistrée dans le journal d’audit.';
  const confirm = (ids: string[], title: string, message: string, label2: string, go = run) => ask({ title, message: [message, danger].filter(Boolean).join(' '), confirmLabel: label2, danger: true }).then(async y => { if (y) await go(ids); });
  const delSel = () => confirm(liveDel, `Supprimer ${liveDel.length} ${label}(s) ?`, final, 'Supprimer');
  const delAll = () => confirm(delAllIds, `Supprimer les ${delAllIds.length} ${label}(s) de cette liste ?`, 'Toute la liste affichée sera supprimée définitivement ; les lignes qui portent de l’argent en cours ou une transaction réussie sont conservées.', 'Tout supprimer');
  const delOne = (id: string) => confirm([id], `Supprimer cette ${label} ?`, final, 'Supprimer');
  const revSel = () => confirm(live, `Révoquer ${live.length} ${label}(s) ?`, 'Effet immédiat : tout ce qui utilise ces éléments cessera de fonctionner.', 'Révoquer', ids => act(ids, 'revoke'));
  const susSel = (action: 'suspend' | 'reactivate') => confirm(live, `${action === 'suspend' ? 'Suspendre' : 'Réactiver'} ${live.length} ${label}(s) ?`, action === 'suspend' ? 'Les comptes sélectionnés sont déconnectés et ne peuvent plus se connecter.' : 'Les comptes sélectionnés peuvent à nouveau se connecter.', action === 'suspend' ? 'Suspendre' : 'Réactiver', ids => act(ids, action));
  const box = { width: 18, height: 18 } as const;
  const pre: Col[] = on ? [{ key: '_sel', label: 'Sélection', head: <input type="checkbox" aria-label="Tout sélectionner" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(all))} style={box} />, render: r => (okDel(r) || okAct(r)) ? <input type="checkbox" aria-label="Sélectionner" checked={sel.has(r.id)} onChange={() => toggle(r.id)} style={box} /> : null }] : [];
  const post: Col[] = delOn ? [{ key: '_del', label: '', right: true, render: r => okDel(r) ? <button className="btn sm d" aria-label="Supprimer" disabled={busy} onClick={() => delOne(r.id)}><Trash2 size={14} /></button> : null }] : [];
  const toolbar = on ? <><span className="mut">{live.length} sélectionnée(s) sur {all.length}</span><div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
    {actOn && revoke && <button className="btn sm d" disabled={!live.length || busy} onClick={revSel}><Ban size={14} />Révoquer la sélection</button>}
    {actOn && suspend && <><button className="btn sm d" disabled={!live.length || busy} onClick={() => susSel('suspend')}><Ban size={14} />Suspendre</button><button className="btn sm" disabled={!live.length || busy} onClick={() => susSel('reactivate')}><RotateCcw size={14} />Réactiver</button></>}
    {delOn && <><button className="btn sm d" disabled={!liveDel.length || busy} onClick={delSel}><Trash2 size={14} />Supprimer la sélection</button><button className="btn sm d" disabled={!delAllIds.length || busy} onClick={delAll}>Tout supprimer</button></>}</div></> : null;
  const status = (err || info) ? <div className={err ? 'err' : 'okm'} role={err ? 'alert' : 'status'}>{err || info}</div> : null;
  return { on, pre, post, toolbar, status, sel, live, all, busy, delOne, delSel, toggle, clear: () => setSel(new Set()), selectAll: () => setSel(new Set(all)) };
}
