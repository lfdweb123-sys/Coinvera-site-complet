'use client';
import { useState } from 'react';
import { Plus, ShieldCheck, X } from 'lucide-react';
import { api, msg, useData } from '@/lib/client';
import { Badge, day, PageHead } from '@/components/Bits';
import DataTable from '@/components/DataTable';
import { useConfirm } from '@/components/Confirm';
const empty = { fullName: '', email: '', password: '', status: 'active' };
export default function Admins() {
  const { data, loading, reload } = useData('/api/admin/admins'); const ask = useConfirm();
  const [modal, setModal] = useState<null | 'new' | any>(null), [f, setF] = useState(empty), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const edit = modal && modal !== 'new';
  const open = (m: 'new' | any) => { setErr(''); setF(m === 'new' ? empty : { fullName: m.fullName, email: m.email, password: '', status: m.status }); setModal(m); };
  async function save(e: React.FormEvent) { e.preventDefault(); setErr(''); setBusy(true);
    try { if (edit) { const b: any = { fullName: f.fullName, email: f.email, status: f.status }; if (f.password) b.password = f.password; await api('/api/admin/admins/' + modal.id, { method: 'PATCH', body: JSON.stringify(b) }); }
      else await api('/api/admin/admins', { method: 'POST', body: JSON.stringify({ fullName: f.fullName, email: f.email, password: f.password }) });
      setModal(null); reload(); } catch (x) { setErr(msg(x)); } setBusy(false); }
  return <div className="stack"><PageHead title="Administrateurs" sub="Seul l’administrateur principal gère les autres administrateurs."><button className="btn p" onClick={() => open('new')}><Plus size={16} />Ajouter un admin</button></PageHead>
    <DataTable loading={loading} rows={data?.items ?? []} empty="Aucun administrateur" cols={[{ key: 'fullName', label: 'Administrateur', render: a => <><b>{a.fullName}</b>{a.super && <span className="badge info" style={{ marginLeft: 8 }}><ShieldCheck size={12} />Principal</span>}<div className="mut">{a.email}</div></> }, { key: 'createdAt', label: 'Créé', render: a => day(a.createdAt) }, { key: 'status', label: 'Statut', render: a => <Badge s={a.status} /> },
      { key: 'a', label: '', right: true, render: a => a.super ? <span className="mut">Protégé</span> : <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}><button className="btn sm" onClick={() => open(a)}>Modifier</button>
        <button className="btn sm d" onClick={async () => { if (await ask({ title: `Supprimer ${a.fullName} ?`, message: 'Son accès à l’administration sera retiré immédiatement.', confirmLabel: 'Supprimer', danger: true })) { try { await api('/api/admin/admins/' + a.id, { method: 'DELETE' }); reload(); } catch (x) { setErr(msg(x)); } } }}>Supprimer</button></div> }]} />
    {err && !modal && <div className="err">{err}</div>}
    {modal && <div className="modal" role="dialog" aria-modal="true" onMouseDown={e => e.target === e.currentTarget && setModal(null)}><form className="mbox" onSubmit={save}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><h3 style={{ fontSize: 22 }}>{edit ? 'Modifier l’administrateur' : 'Ajouter un administrateur'}</h3><button type="button" className="btn sm" aria-label="Fermer" onClick={() => setModal(null)}><X size={16} /></button></div>
      <label htmlFor="an">Nom complet</label><input id="an" className="in" required minLength={2} value={f.fullName} onChange={e => setF({ ...f, fullName: e.target.value })} />
      <label htmlFor="ae">Adresse e-mail</label><input id="ae" className="in" type="email" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
      <label htmlFor="ap">{edit ? 'Nouveau mot de passe (facultatif)' : 'Mot de passe'}</label><input id="ap" className="in" type="password" minLength={8} required={!edit} value={f.password} onChange={e => setF({ ...f, password: e.target.value })} autoComplete="new-password" />
      {edit && <><label htmlFor="as">Statut</label><select id="as" className="in" value={f.status} onChange={e => setF({ ...f, status: e.target.value })}><option value="active">Actif</option><option value="suspended">Suspendu</option></select></>}
      {err && <div className="err" role="alert">{err}</div>}<div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20, flexWrap: 'wrap' }}><button type="button" className="btn" onClick={() => setModal(null)}>Annuler</button><button className="btn p" disabled={busy}>{busy ? 'Enregistrement…' : edit ? 'Enregistrer' : 'Créer l’administrateur'}</button></div></form></div>}</div>;
}
