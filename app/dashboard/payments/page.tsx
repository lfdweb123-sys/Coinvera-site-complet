'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Copy, Plus } from 'lucide-react';
import { api, msg, useData } from '@/lib/client';
import { Badge, day, PageHead, usd } from '@/components/Bits';
import DataTable from '@/components/DataTable';
import { useConfirm } from '@/components/Confirm';
import { CopyRow } from '@/components/CopyBtn';
import { Err, Modal, Nav, Stepper } from '@/components/Wizard';
export default function Links() {
  const [page, setPage] = useState(1); const { data, loading, reload } = useData(`/api/links?page=${page}&size=10`); const keys = useData('/api/keys'); const ask = useConfirm();
  const [open, setOpen] = useState(false), [copied, setCopied] = useState('');
  const activated = !!keys.data?.activation?.activated;
  const copy = (u: string) => { navigator.clipboard.writeText(u); setCopied(u); setTimeout(() => setCopied(''), 1500); };
  return <div className="stack"><PageHead title="Liens de paiement" sub="Créez des liens à partager par email, message ou réseaux sociaux pour encaisser sans site web."><button className="btn p" onClick={() => setOpen(true)}><Plus size={16} />Créer un lien</button></PageHead>
    {!activated && <div className="card" style={{ background: 'var(--warnsoft)', borderColor: '#F3DDA5', display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}><div><b>Activation requise</b><div style={{ fontSize: 14 }}>Vos liens ne pourront encaisser des paiements qu’une fois votre compte activé.</div></div><Link href="/dashboard/activate" className="btn p">Activer mon compte</Link></div>}
    <DataTable loading={loading} rows={data?.items ?? []} empty="Aucun lien de paiement" emptyHint="Créez votre premier lien pour encaisser un paiement en quelques secondes." server={{ total: data?.total ?? 0, page, size: 10, onPage: setPage }}
      cols={[{ key: 'title', label: 'Lien', render: l => <><b>{l.title}</b><div className="mut mono" style={{ fontSize: 12 }}>{l.url}</div></> }, { key: 'amount', label: 'Montant', right: true, num: true, render: l => usd(l.amount) }, { key: 'uses', label: 'Utilisations', right: true, num: true }, { key: 'createdAt', label: 'Créé', render: l => day(l.createdAt) }, { key: 'active', label: 'Statut', render: l => <Badge s={l.active ? 'active' : 'revoked'} /> },
        { key: 'a', label: '', right: true, render: l => <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}><button className="btn sm" onClick={() => copy(l.url)}><Copy size={14} />{copied === l.url ? 'Copié' : 'Copier'}</button><button className="btn sm" onClick={async () => { await api('/api/links/' + l.id, { method: 'PATCH', body: JSON.stringify({ active: !l.active }) }); reload(); }}>{l.active ? 'Désactiver' : 'Activer'}</button>
          <button className="btn sm d" onClick={async () => { if (await ask({ title: 'Supprimer ce lien ?', message: 'Il ne pourra plus être utilisé. Les paiements déjà reçus ne sont pas affectés.', confirmLabel: 'Supprimer', danger: true })) { await api('/api/links/' + l.id, { method: 'DELETE' }); reload(); } }}>Supprimer</button></div> }]} />
    {open && <NewLink onClose={() => setOpen(false)} onCreated={reload} />}</div>;
}

function NewLink({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [f, setF] = useState({ title: '', amount: '', description: '' }), [st, setSt] = useState(0), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [url, setUrl] = useState('');
  const amt = Number(f.amount.replace(',', '.')), okTitle = f.title.trim().length >= 2, okAmt = Number.isFinite(amt) && amt > 0;
  async function create() { setErr(''); setBusy(true); try { const r = await api('/api/links', { method: 'POST', body: JSON.stringify({ title: f.title.trim(), amount: amt, description: f.description }) }); setUrl(r.url ?? ''); setSt(3); onCreated(); } catch (x) { setErr(msg(x)); } setBusy(false); }
  return <Modal title="Créer un lien de paiement" size="md" onClose={onClose}><Stepper steps={['Produit', 'Montant', 'Vérification', 'Lien créé']} cur={st} /><div className="sbody">
    {st === 0 && <><p className="mut" style={{ margin: 0 }}>Le client paie par carte sur une page sécurisée.</p><label htmlFor="lt">Titre du produit ou de la commande</label><input id="lt" className="in" autoFocus maxLength={100} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} onKeyDown={e => e.key === 'Enter' && okTitle && setSt(1)} placeholder="Ex. Abonnement conseil — mars" />
      <label htmlFor="ld">Description <span className="mut">(facultatif)</span></label><textarea id="ld" className="in" rows={3} maxLength={300} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></>}
    {st === 1 && <><label htmlFor="la">Montant à encaisser (USD)</label><input id="la" className="in" autoFocus inputMode="decimal" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value.replace(/[^0-9.,]/g, '') })} onKeyDown={e => e.key === 'Enter' && okAmt && setSt(2)} placeholder="49,00" />{f.amount !== '' && !okAmt && <p className="err" role="alert">Saisissez un montant supérieur à 0.</p>}</>}
    {st === 2 && <><div className="kv"><div>Titre <b style={{ whiteSpace: 'normal' }}>{f.title.trim()}</b></div><div className="tot">Montant <b>{usd(amt)}</b></div>{f.description.trim() && <div className="mut">{f.description.trim()}</div>}</div><Err m={err} /></>}
    {st === 3 && <><p className="okm" role="status" style={{ margin: 0 }}>Votre lien de paiement est prêt. Partagez-le par e-mail, message ou réseaux sociaux.</p>{url && <CopyRow label="Lien de paiement" value={url} mono />}<div className="btns"><button className="btn p" onClick={onClose}>Terminer</button></div></>}
  </div>{st === 0 && <Nav onNext={() => setSt(1)} disabled={!okTitle} />}{st === 1 && <Nav onBack={() => setSt(0)} onNext={() => setSt(2)} disabled={!okAmt} />}{st === 2 && <Nav onBack={() => setSt(1)} onNext={create} busy={busy} last next={busy ? 'Création…' : 'Créer le lien'} />}</Modal>;
}
