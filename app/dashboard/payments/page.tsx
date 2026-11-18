'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Copy, Link2, Plus, X } from 'lucide-react';
import { api, msg, useData } from '@/lib/client';
import { Badge, day, PageHead, usd } from '@/components/Bits';
import DataTable from '@/components/DataTable';
import { useConfirm } from '@/components/Confirm';
export default function Links() {
  const [page, setPage] = useState(1); const { data, loading, reload } = useData(`/api/links?page=${page}&size=10`); const keys = useData('/api/keys'); const ask = useConfirm();
  const [open, setOpen] = useState(false), [f, setF] = useState({ title: '', amount: '', description: '' }), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [copied, setCopied] = useState('');
  const activated = !!keys.data?.activation?.activated;
  async function create(e: React.FormEvent) { e.preventDefault(); setErr(''); setBusy(true); try { await api('/api/links', { method: 'POST', body: JSON.stringify({ title: f.title, amount: Number(f.amount.replace(',', '.')), description: f.description }) }); setOpen(false); setF({ title: '', amount: '', description: '' }); reload(); } catch (x) { setErr(msg(x)); } setBusy(false); }
  const copy = (u: string) => { navigator.clipboard.writeText(u); setCopied(u); setTimeout(() => setCopied(''), 1500); };
  return <div className="stack"><PageHead title="Liens de paiement" sub="Créez des liens à partager par email, message ou réseaux sociaux pour encaisser sans site web."><button className="btn p" onClick={() => setOpen(true)}><Plus size={16} />Créer un lien</button></PageHead>
    {!activated && <div className="card" style={{ background: 'var(--warnsoft)', borderColor: '#F3DDA5', display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}><div><b>Activation requise</b><div style={{ fontSize: 14 }}>Vos liens ne pourront encaisser des paiements qu’une fois votre compte activé.</div></div><Link href="/dashboard/activate" className="btn p">Activer mon compte</Link></div>}
    <DataTable loading={loading} rows={data?.items ?? []} empty="Aucun lien de paiement" emptyHint="Créez votre premier lien pour encaisser un paiement en quelques secondes." server={{ total: data?.total ?? 0, page, size: 10, onPage: setPage }}
      cols={[{ key: 'title', label: 'Lien', render: l => <><b>{l.title}</b><div className="mut mono" style={{ fontSize: 12 }}>{l.url}</div></> }, { key: 'amount', label: 'Montant', right: true, num: true, render: l => usd(l.amount) }, { key: 'uses', label: 'Utilisations', right: true, num: true }, { key: 'createdAt', label: 'Créé', render: l => day(l.createdAt) }, { key: 'active', label: 'Statut', render: l => <Badge s={l.active ? 'active' : 'revoked'} /> },
        { key: 'a', label: '', right: true, render: l => <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}><button className="btn sm" onClick={() => copy(l.url)}><Copy size={14} />{copied === l.url ? 'Copié' : 'Copier'}</button><button className="btn sm" onClick={async () => { await api('/api/links/' + l.id, { method: 'PATCH', body: JSON.stringify({ active: !l.active }) }); reload(); }}>{l.active ? 'Désactiver' : 'Activer'}</button>
          <button className="btn sm d" onClick={async () => { if (await ask({ title: 'Supprimer ce lien ?', message: 'Il ne pourra plus être utilisé. Les paiements déjà reçus ne sont pas affectés.', confirmLabel: 'Supprimer', danger: true })) { await api('/api/links/' + l.id, { method: 'DELETE' }); reload(); } }}>Supprimer</button></div> }]} />
    {open && <div className="modal" role="dialog" aria-modal="true" aria-label="Créer un lien de paiement" onMouseDown={e => e.target === e.currentTarget && setOpen(false)}><form className="mbox" onSubmit={create}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><div style={{ display: 'flex', gap: 12 }}><div className="ic" style={{ margin: 0 }}><Link2 size={22} /></div><div><h3 style={{ fontSize: 22 }}>Créer un lien de paiement</h3><p className="mut" style={{ margin: '4px 0 0' }}>Le client paie par carte sur une page sécurisée.</p></div></div><button type="button" className="btn sm" aria-label="Fermer" onClick={() => setOpen(false)}><X size={16} /></button></div>
      <label htmlFor="lt">Titre du produit ou de la commande</label><input id="lt" className="in" required minLength={2} maxLength={100} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Ex. Abonnement conseil — mars" />
      <label htmlFor="la">Montant (USD)</label><input id="la" className="in" required inputMode="decimal" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value.replace(/[^0-9.,]/g, '') })} placeholder="49,00" />
      <label htmlFor="ld">Description <span className="mut">(facultatif)</span></label><textarea id="ld" className="in" rows={3} maxLength={300} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} />
      {err && <div className="err" role="alert">{err}</div>}<div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20, flexWrap: 'wrap' }}><button type="button" className="btn" onClick={() => setOpen(false)}>Annuler</button><button className="btn p" disabled={busy}>{busy ? 'Création…' : 'Créer le lien'}</button></div></form></div>}</div>;
}
