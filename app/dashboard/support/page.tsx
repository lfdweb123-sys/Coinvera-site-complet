'use client';
import { useState } from 'react';
import { api, auth, msg, useData } from '@/lib/client';
import { Badge, day, PageHead } from '@/components/Bits';
import DataTable from '@/components/DataTable';
const CATS = ['Support technique', 'Paiement', 'Retrait', 'API', 'WooCommerce', 'Compte', 'Autre'];
export default function Support() {
  const t = useData('/api/tickets'); const [f, setF] = useState({ subject: '', category: 'Support technique', message: '' }), [m, setM] = useState(''), [e, setE] = useState('');
  return <div className="stack" style={{ maxWidth: 860 }}><PageHead title="Contacter le support" sub="Nous répondons par email et dans votre tableau de bord." />
    <form className="card" onSubmit={async ev => { ev.preventDefault(); setM(''); setE(''); try { await api('/api/contact', { method: 'POST', body: JSON.stringify({ ...f, name: auth.currentUser?.displayName || 'Marchand', email: auth.currentUser?.email }) }); setM('Message envoyé. Vous recevrez une confirmation par email.'); setF({ ...f, subject: '', message: '' }); t.reload(); } catch (x) { setE(msg(x)); } }}>
      <label htmlFor="s">Sujet</label><input id="s" className="in" required minLength={3} value={f.subject} onChange={x => setF({ ...f, subject: x.target.value })} />
      <label htmlFor="c">Catégorie</label><select id="c" className="in" value={f.category} onChange={x => setF({ ...f, category: x.target.value })}>{CATS.map(c => <option key={c}>{c}</option>)}</select>
      <label htmlFor="m">Message</label><textarea id="m" className="in" rows={5} required minLength={10} value={f.message} onChange={x => setF({ ...f, message: x.target.value })} />
      {m && <div className="okm">{m}</div>}{e && <div className="err">{e}</div>}<button className="btn p" style={{ marginTop: 12 }}>Envoyer</button></form>
    <h3>Mes demandes</h3><DataTable loading={t.loading} rows={t.data?.items ?? []} empty="Aucune demande" cols={[{ key: 'subject', label: 'Sujet' }, { key: 'category', label: 'Catégorie' }, { key: 'createdAt', label: 'Date', render: x => day(x.createdAt) }, { key: 'status', label: 'Statut', render: x => <Badge s={x.status} /> }]} /></div>;
}
