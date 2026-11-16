'use client';
import { useState } from 'react';
import { api, msg, useData } from '@/lib/client';
import { Badge, day, PageHead, usd } from '@/components/Bits';
import DataTable from '@/components/DataTable';
const CH: Record<string, string> = { TRX: 'TRON (TRC20)', ETH: 'Ethereum (ERC20)', BSC: 'BNB Smart Chain (BEP20)' };
export default function Wd() {
  const { data, loading, reload } = useData('/api/withdrawals'); const bal = useData('/api/balance'); const pr = useData('/api/pricing');
  const [chain, setChain] = useState('TRX'), [address, setAddress] = useState(''), [amount, setAmount] = useState(''), [err, setErr] = useState(''), [ok, setOk] = useState(''), [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setOk('');
    if (!confirm(`Confirmer le retrait de ${amount} USDT sur ${CH[chain]} vers ${address} ?\nLes transactions blockchain sont irréversibles.`)) return;
    setBusy(true);
    try { await api('/api/withdrawals', { method: 'POST', body: JSON.stringify({ coin: 'USDT', chain, address: address.trim(), amount: Number(amount) }) }); setOk('Demande enregistrée : elle sera traitée automatiquement après contrôles.'); setAmount(''); reload(); bal.reload(); }
    catch (x) { setErr(msg(x)); } setBusy(false);
  }
  return <div className="stack"><PageHead title="Retraits" sub="Envoyez votre solde disponible en USDT." />
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,340px),1fr))', alignItems: 'start' }}>
      <form className="card" onSubmit={submit}><div className="mut">Solde disponible</div><div style={{ font: '700 30px Space Grotesk' }}>{usd(bal.data?.available)}</div>
        <label htmlFor="c">Cryptomonnaie</label><select id="c" className="in" disabled><option>USDT</option></select>
        <label htmlFor="n">Réseau</label><select id="n" className="in" value={chain} onChange={e => setChain(e.target.value)}>{Object.entries(CH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <label htmlFor="a">Adresse de destination</label><input id="a" className="in" required value={address} onChange={e => setAddress(e.target.value)} placeholder="Collez l’adresse du portefeuille" />
        <label htmlFor="m">Montant (USDT)</label><input id="m" className="in" required type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} />
        <p className="mut" style={{ marginTop: 10 }}>Minimum {pr.data?.minWithdrawalUsd ?? 10} USD. Des frais de réseau peuvent s’appliquer ; le montant exact est confirmé à l’exécution.</p>
        {err && <div className="err" role="alert">{err}</div>}{ok && <div className="okm">{ok}</div>}<button className="btn p lg" style={{ width: '100%' }} disabled={busy}>{busy ? 'Envoi…' : 'Demander le retrait'}</button></form>
      <div className="card flat"><h3 style={{ marginBottom: 8 }}>Avant de confirmer</h3><ul className="ck">{['Vérifiez l’adresse et le réseau : un envoi est irréversible.', 'Le montant est réservé dès la demande.', 'Le retrait est terminé uniquement après confirmation réelle.', 'En cas d’échec confirmé, le montant revient à votre solde disponible.'].map(x => <li key={x}>{x}</li>)}</ul></div></div>
    <h3>Historique</h3>
    <DataTable loading={loading} rows={data?.items ?? []} empty="Aucun retrait" cols={[{ key: 'coin', label: 'Actif', render: r => `${r.coin} · ${r.chain}` }, { key: 'amountUnits', label: 'Montant', right: true, num: true, render: r => usd(r.amountUnits) }, { key: 'createdAt', label: 'Date', render: r => day(r.createdAt) }, { key: 'txHash', label: 'Hash', render: r => <span className="mut" style={{ wordBreak: 'break-all' }}>{r.txHash ?? '—'}</span> }, { key: 'status', label: 'Statut', render: r => <Badge s={r.status} /> }]} /></div>;
}
