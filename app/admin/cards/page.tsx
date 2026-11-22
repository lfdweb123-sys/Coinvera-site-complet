'use client';
import { useEffect, useState } from 'react';
import { api, msg, useData } from '@/lib/client';
import { usd } from '@/components/Bits';
const F: [string, string, boolean][] = [['issueFlat', 'Marge fixe à l’émission (USD)', false], ['issueBps', 'Marge à l’émission, sur le solde d’ouverture (points de base, 100 = 1 %)', true], ['loadFlat', 'Marge fixe par recharge (USD)', false], ['loadBps', 'Marge par recharge, sur le montant (points de base, 100 = 1 %)', true]];
const num = (x: unknown) => Number(String(x ?? '').trim().replace(',', '.'));
export default function C() {
  const { data, error, loading, reload } = useData('/api/admin/cards'); const [v, setV] = useState<any>(null), [m, setM] = useState(''), [ok, setOk] = useState(false), [busy, setBusy] = useState(false);
  useEffect(() => { if (data?.settings) setV(data.settings); }, [data]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setM(''); setOk(false); if (!v) return;
    const vals = F.map(([k, , int]) => ({ k, n: num(v[k]), int })); const bad = vals.find(x => !Number.isFinite(x.n) || x.n < 0 || (x.int && !Number.isInteger(x.n)));
    if (bad) { setM('Valeurs invalides : saisissez des nombres positifs (par exemple 1.50 et 250). Les points de base sont des nombres entiers.'); return; }
    setBusy(true);
    try { await api('/api/admin/cards', { method: 'PUT', body: JSON.stringify({ enabled: !!v.enabled, refundAdvance: v.refundAdvance !== false, ...Object.fromEntries(vals.map(x => [x.k, x.n])) }) }); setOk(true); setM('Enregistré et historisé dans le journal d’audit.'); reload(); }
    catch (x) { setM(msg(x)); }
    setBusy(false);
  };
  return <div className="stack" style={{ maxWidth: 680 }}>
    <h1>Cartes virtuelles</h1>
    {error && !data && <p className="err" role="alert">Impossible de charger les réglages ({error}). <button className="btn" onClick={reload}>Réessayer</button></p>}
    <div className="card stack"><h2 style={{ margin: 0 }}>Portefeuille du programme</h2>
      {data?.error && <p className="err" role="alert">CryptoInfra injoignable ou non configuré ({data.error}). Les réglages ci-dessous restent modifiables.</p>}
      {data?.maintenance && <p className="err">CryptoInfra est en maintenance : émission et recharges suspendues.</p>}
      {data?.wallet?.map((w: any) => <div key={w.core} className="kv"><div><b>{w.name}</b> ({w.status}){w.low ? ' — solde bas' : ''}</div><div>Solde <b>{usd(w.balance)}</b> · dépensé sur 24 h <b>{usd(w.spent24h)}</b>{w.rechargeFeeBps != null ? ` · frais de recharge ${w.rechargeFeeBps / 100} %` : ''}</div>
        {w.addresses.map((a: any) => <div key={a.address}><small>{a.asset_id} :</small> <code style={{ wordBreak: 'break-all' }}>{a.address}</code></div>)}</div>)}
      {data?.liabilities && data?.advances && <div className="kv"><div>Crédit cartes dû aux utilisateurs <b>{usd(data.liabilities.credit)}</b> · fonds réservés (opérations en cours) <b>{usd(data.liabilities.reserved)}</b></div>
        <div>Avances de remboursement en attente de règlement : <b>{data.advances.count}</b> ({usd(data.advances.units)}){data.advances.count ? ` · la plus ancienne : ${data.advances.oldestDays} j` : ''}{data.advances.held ? ` · ${data.advances.held} bloquée(s) (état « held » chez CryptoInfra : à traiter avec leur support)` : ''}{data.advances.stale ? ` · ${data.advances.stale} de plus de 50 jours : à vérifier` : ''}</div>
        {data.oldestPendingMin > 30 && <div className="err">Une opération carte est en attente depuis {data.oldestPendingMin} min : vérifier CryptoInfra et le cron.</div>}</div>}
      <p className="mut">Chaque carte et chaque recharge est payée par ce portefeuille : alimentez-le en USDT (TRC20 ou BEP20). Utilisateurs avec compte carte : {data?.holders ?? '—'} · opérations en cours : {data?.pendingOrders ?? '—'}.</p></div>
    <form className="card stack" onSubmit={save} aria-busy={loading}>
      <h2 style={{ margin: 0 }}>Activation et marge</h2>
      {!v && <p className="mut" role="status">{loading ? 'Chargement des réglages…' : 'Réglages indisponibles.'}</p>}
      {v && <>
        <label><input type="checkbox" checked={!!v.enabled} onChange={e => setV({ ...v, enabled: e.target.checked })} /> Service de cartes activé pour les utilisateurs</label>
        <label><input type="checkbox" checked={v.refundAdvance !== false} onChange={e => setV({ ...v, refundAdvance: e.target.checked })} /> Créditer le remboursement dès la fermeture de la carte (avance), puis ajuster à l’arrivée du montant réel</label>
        {F.map(([k, l]) => <div key={k}><label htmlFor={k}>{l}</label><input id={k} className="in" inputMode="decimal" value={v[k] ?? ''} onChange={e => setV({ ...v, [k]: e.target.value })} /></div>)}
        <p className="mut">La marge s’ajoute au total facturé par CryptoInfra et s’affiche dans le total que paie l’utilisateur ; elle est comptabilisée en revenu de la plateforme. Valeurs conseillées : 1.50 · 250 · 0.30 · 250.</p></>}
      <div><button className="btn p" disabled={!v || busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button> <span className={ok ? 'okm' : 'err'} role="status">{m}</span></div></form></div>;
}
