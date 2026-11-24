'use client';
import { useState } from 'react';
import { Plus, ShieldCheck } from 'lucide-react';
import { api, msg, useData } from '@/lib/client';
import { Badge, day, PageHead } from '@/components/Bits';
import DataTable from '@/components/DataTable';
import { useConfirm } from '@/components/Confirm';
import { useBulk } from '@/components/Bulk';
import { Err, Modal, Nav, Stepper } from '@/components/Wizard';
const empty = { fullName: '', email: '', password: '', status: 'active' };
export default function Admins() {
  const { data, loading, reload } = useData('/api/admin/admins'); const ask = useConfirm();
  const [modal, setModal] = useState<null | 'new' | any>(null), [f, setF] = useState(empty), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [st, setSt] = useState(0);
  const bulk = useBulk({ c: 'admins', rows: data?.items ?? [], reload, canDelete: a => !a.super, label: 'administrateur', danger: 'Leur accès à l’administration est retiré immédiatement.', remove: async ids => { for (const id of ids) await api('/api/admin/admins/' + id, { method: 'DELETE' }); } });
  const edit = modal && modal !== 'new';
  const okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()), okProfile = f.fullName.trim().length >= 2 && okEmail, okPwd = edit ? (f.password === '' || f.password.length >= 8) : f.password.length >= 8;
  const open = (m: 'new' | any) => { setErr(''); setSt(0); setF(m === 'new' ? empty : { fullName: m.fullName, email: m.email, password: '', status: m.status }); setModal(m); };
  async function save() { setErr(''); setBusy(true);
    try { if (edit) { const b: any = { fullName: f.fullName, email: f.email, status: f.status }; if (f.password) b.password = f.password; await api('/api/admin/admins/' + modal.id, { method: 'PATCH', body: JSON.stringify(b) }); }
      else await api('/api/admin/admins', { method: 'POST', body: JSON.stringify({ fullName: f.fullName, email: f.email, password: f.password }) });
      setModal(null); reload(); } catch (x) { setErr(msg(x)); } setBusy(false); }
  return <div className="stack"><PageHead title="Administrateurs" sub="Seul l’administrateur principal gère les autres administrateurs."><button className="btn p" onClick={() => open('new')}><Plus size={16} />Ajouter un admin</button></PageHead>
    {bulk.status}<DataTable loading={loading} rows={data?.items ?? []} empty="Aucun administrateur" toolbar={bulk.toolbar} cols={[...bulk.pre, { key: 'fullName', label: 'Administrateur', render: a => <><b>{a.fullName}</b>{a.super && <span className="badge info" style={{ marginLeft: 8 }}><ShieldCheck size={12} />Principal</span>}<div className="mut">{a.email}</div></> }, { key: 'createdAt', label: 'Créé', render: a => day(a.createdAt) }, { key: 'status', label: 'Statut', render: a => <Badge s={a.status} /> },
      { key: 'a', label: '', right: true, render: a => a.super ? <span className="mut">Protégé</span> : <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}><button className="btn sm" onClick={() => open(a)}>Modifier</button>
        <button className="btn sm d" onClick={async () => { if (await ask({ title: `Supprimer ${a.fullName} ?`, message: 'Son accès à l’administration sera retiré immédiatement.', confirmLabel: 'Supprimer', danger: true })) { try { await api('/api/admin/admins/' + a.id, { method: 'DELETE' }); reload(); } catch (x) { setErr(msg(x)); } } }}>Supprimer</button></div> }]} />
    {err && !modal && <div className="err">{err}</div>}
    {modal && <Modal title={edit ? 'Modifier l’administrateur' : 'Ajouter un administrateur'} size="md" onClose={() => setModal(null)}><Stepper steps={['Profil', 'Accès', 'Récapitulatif']} cur={st} /><div className="sbody">
      {st === 0 && <><label htmlFor="an">Nom complet</label><input id="an" className="in" autoFocus value={f.fullName} onChange={e => setF({ ...f, fullName: e.target.value })} autoComplete="off" />
        <label htmlFor="ae">Adresse e-mail</label><input id="ae" className="in" type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} autoComplete="off" />{f.email !== '' && !okEmail && <p className="err" role="alert">Adresse e-mail invalide.</p>}</>}
      {st === 1 && <><label htmlFor="ap">{edit ? 'Nouveau mot de passe (facultatif)' : 'Mot de passe'}</label><input id="ap" className="in" type="password" autoFocus value={f.password} onChange={e => setF({ ...f, password: e.target.value })} autoComplete="new-password" />
        <p className={f.password && !okPwd ? 'err' : 'mut'} style={{ margin: 0 }}>8 caractères au moins.</p>
        {edit && <><label htmlFor="as">Statut</label><select id="as" className="in" value={f.status} onChange={e => setF({ ...f, status: e.target.value })}><option value="active">Actif</option><option value="suspended">Suspendu</option></select></>}</>}
      {st === 2 && <><div className="kv"><div>Nom <b>{f.fullName.trim()}</b></div><div>E-mail <b>{f.email.trim()}</b></div><div>Mot de passe <b>{f.password ? '••••••••' : 'inchangé'}</b></div>{edit && <div>Statut <b>{f.status === 'active' ? 'Actif' : 'Suspendu'}</b></div>}</div><Err m={err} /></>}
    </div>{st === 0 && <Nav onNext={() => setSt(1)} disabled={!okProfile} />}{st === 1 && <Nav onBack={() => setSt(0)} onNext={() => setSt(2)} disabled={!okPwd} />}{st === 2 && <Nav onBack={() => setSt(1)} onNext={save} busy={busy} last next={busy ? 'Enregistrement…' : edit ? 'Enregistrer' : 'Créer l’administrateur'} />}</Modal>}</div>;
}
