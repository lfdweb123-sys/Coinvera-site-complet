'use client';
import { useState } from 'react';
import { api, msg, useData } from '@/lib/client';
import { Badge, day, PageHead, usd } from '@/components/Bits';
import DataTable from '@/components/DataTable';
import { CopyRow } from '@/components/CopyBtn';
import { useBulk } from '@/components/Bulk';
const FINAL = ['completed', 'failed'];
export default function W() {
  const { data, loading, reload } = useData('/api/admin/list?c=withdrawals'); const [hash, setHash] = useState<Record<string, string>>({}), [why, setWhy] = useState<Record<string, string>>({}), [m, setM] = useState('');
  const bulk = useBulk({ c: 'withdrawals', rows: data?.items ?? [], reload, canDelete: x => FINAL.includes(x.status), label: 'ligne', danger: 'Seuls les retraits terminés ou échoués peuvent être supprimés.' });
  const pending: any[] = (data?.items ?? []).filter((x: any) => x.status === 'pending_admin' || x.status === 'needs_review');
  const act = async (id: string, body: object) => { setM(''); try { await api('/api/admin/withdrawals/' + id, { method: 'POST', body: JSON.stringify(body) }); reload(); } catch (x) { setM(msg(x)); } };
  return <div className="stack"><PageHead title="Retraits" sub="Retraits par adresse : vérifiez l’adresse, envoyez les fonds depuis votre portefeuille, puis validez avec le hash de la transaction. Un refus remet les fonds sur le solde de l’utilisateur." />
    {m && <p className="err" role="alert">{m}</p>}
    {!!pending.length && <div className="card stack"><h2 style={{ margin: 0 }}>À valider ({pending.length})</h2>
      {pending.map((x: any) => <div key={x.id} className="card flat stack" style={{ borderColor: 'var(--line)' }}>
        <div className="kv"><div><Badge s={x.status} /> · <b>{x.coin} · {x.chain}</b> · {day(x.createdAt)} · <small>marchand <code>{x.merchantId}</code></small>{x.auto ? ' · retrait automatique par seuil' : ''}</div>
          <div>Demandé <b>{usd(x.amountUnits)}</b> · frais <b>{usd((x.feeUnits ?? 0) / 1e6)}</b> · <b>à envoyer : {usd(x.sendUnits != null ? x.sendUnits / 1e6 : x.amountUnits)}</b></div></div>
        <CopyRow label="Adresse de destination" value={String(x.address)} mono />
        {x.status === 'needs_review' && <p className="mut" style={{ margin: 0 }}>État inconnu après un envoi automatique : vérifiez d’abord dans Bybit si le retrait existe avant d’envoyer ou de remettre en file.</p>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="in" style={{ flex: '1 1 260px', minWidth: 0 }} placeholder="Hash de la transaction (après envoi)" aria-label="Hash de la transaction" value={hash[x.id] ?? ''} onChange={e => setHash({ ...hash, [x.id]: e.target.value.trim() })} />
          <button className="btn p" disabled={(hash[x.id] ?? '').length < 8} onClick={() => act(x.id, { action: 'approve', txHash: hash[x.id] })}>J’ai envoyé : valider</button></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="in" style={{ flex: '1 1 260px', minWidth: 0 }} placeholder="Motif du refus (visible par l’utilisateur)" aria-label="Motif du refus" value={why[x.id] ?? ''} onChange={e => setWhy({ ...why, [x.id]: e.target.value })} />
          <button className="btn" disabled={(why[x.id] ?? '').trim().length < 3} onClick={() => act(x.id, { action: 'reject', reason: why[x.id].trim() })}>Refuser et rembourser</button>
          <button className="btn" onClick={() => act(x.id, { action: 'requeue' })} title="Envoi automatique par Bybit (clé Bybit ou relais requis)">Envoyer par Bybit</button></div></div>)}</div>}
    {bulk.status}<DataTable loading={loading} rows={data?.items ?? []} empty="Aucun retrait" toolbar={bulk.toolbar} cols={[...bulk.pre, { key: 'coin', label: 'Actif', render: x => `${x.coin} · ${x.chain}` }, { key: 'merchantId', label: 'Marchand', render: x => <code>{x.merchantId}</code> }, { key: 'amountUnits', label: 'Montant', right: true, num: true, render: x => usd(x.amountUnits) }, { key: 'createdAt', label: 'Date', render: x => day(x.createdAt) }, { key: 'status', label: 'Statut', render: x => <Badge s={x.status} /> },
      { key: 'a', label: '', right: true, render: x => x.status === 'needs_review' && <button className="btn sm" onClick={() => act(x.id, { action: 'requeue' })}>Remettre en file</button> }, ...bulk.post]} /></div>;
}
