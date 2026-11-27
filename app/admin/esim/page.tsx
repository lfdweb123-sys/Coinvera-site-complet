'use client';
import { useState } from 'react';
import { api, msg, useData } from '@/lib/client';
import { day } from '@/components/Bits';
import { STATES } from '@/lib/esim/format';
// Suivi eSIM Access : un solde vide bloque tous les achats (les utilisateurs sont remboursés). Actions : suspendre, réactiver, révoquer (non remboursable), envoyer un SMS à l'eSIM.
const usd = (n: string | number) => Number(n).toLocaleString('fr-FR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export default function AdminEsim() {
  const { data, error, loading, reload } = useData('/api/admin/esim'), [e, setE] = useState(''), [ok, setOk] = useState(''), [busy, setBusy] = useState('');
  const run = async (id: string, action: string, message?: string) => { setE(''); setOk(''); setBusy(id + action); try { await api('/api/admin/esim', { method: 'POST', body: JSON.stringify({ id, action, message }) }); setOk('Action effectuée.'); reload(); } catch (x) { setE(msg(x)); } setBusy(''); };
  const sms = (id: string) => { const m = window.prompt('Message SMS à envoyer à cette eSIM (500 caractères maximum) :'); if (m) run(id, 'sms', m.slice(0, 500)); };
  const counts = data?.counts ?? {};
  return <div className="stack"><h1 style={{ margin: 0 }}>eSIM</h1>{(error || e) && <p className="err" role="alert">{error || e}</p>}{ok && <p className="okm" role="status">{ok}</p>}
    <div className="card"><h3 style={{ marginTop: 0 }}>Compte eSIM Access</h3>{loading ? <p className="mut">Chargement…</p> : !data?.enabled ? <p className="mut">Module inactif : renseignez ESIMACCESS_ACCESS_CODE.</p> : data.balance != null ? <div className="kv"><div>Solde revendeur <b>{usd(data.balance)}</b></div></div> : <p className="err" role="alert">Impossible de lire le solde : vérifiez ESIMACCESS_ACCESS_CODE.</p>}</div>
    <div className="card"><h3 style={{ marginTop: 0 }}>Commandes</h3><div className="kv">{Object.entries(STATES).map(([k, v]) => <div key={k}>{v.label} <b>{counts[k] ?? 0}</b></div>)}<div>Recharges <b>{counts.topup ?? 0}</b></div></div></div>
    <div className="card"><h3 style={{ marginTop: 0 }}>Dernières commandes</h3><div style={{ overflowX: 'auto' }}><table className="tbl"><thead><tr><th>Date</th><th>Utilisateur</th><th>Type</th><th>eSIM</th><th>Statut</th><th>Prix</th><th>Coût</th><th>Détail</th><th>Actions</th></tr></thead><tbody>
      {(data?.recent ?? []).map((r: any) => <tr key={r.id}><td>{r.at ? day(new Date(r.at).toISOString()) : '—'}</td><td>{r.merchantId}…</td><td>{r.kind === 'topup' ? 'Recharge' : r.daily ? `Par jour (${r.days} j)` : 'Forfait'}</td><td>{r.title}{r.iccid ? <span className="mut"> {r.iccid}</span> : null}</td><td>{STATES[r.state]?.label ?? r.state}</td><td>{usd(r.charge)}</td><td>{usd(r.cost)}</td><td>{r.error ?? ''}</td>
        <td>{r.manageable ? <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{r.state === 'suspended' ? <button className="btn sm" disabled={!!busy} onClick={() => run(r.id, 'unsuspend')}>Réactiver</button> : ['active', 'installed', 'ready', 'depleted'].includes(r.state) && <button className="btn sm" disabled={!!busy} onClick={() => run(r.id, 'suspend')}>Suspendre</button>}
          <button className="btn sm" disabled={!!busy} onClick={() => sms(r.id)}>SMS</button>{!['revoked', 'refunded', 'expired'].includes(r.state) && <button className="btn sm d" disabled={!!busy} onClick={() => window.confirm('Révoquer cette eSIM ? Action définitive et NON remboursable.') && run(r.id, 'revoke')}>Révoquer</button>}</span> : '—'}</td></tr>)}
      {!data?.recent?.length && !loading && <tr><td colSpan={9} className="mut">Aucune commande pour le moment.</td></tr>}</tbody></table></div></div></div>;
}
