'use client';
import { useData } from '@/lib/client';
import { day } from '@/components/Bits';
// Suivi du compte 5sim : un solde vide bloque tous les achats (les utilisateurs sont alors remboursés), une note à 0 les bloque 24 h (« not enough rating »).
const ST: Record<string, string> = { reserved: 'Achat en cours', review: 'Vérification', waiting: 'En attente du code', received: 'Code reçu', failed: 'Remboursé' };
const usd = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export default function AdminNumbers() {
  const { data, error, loading } = useData('/api/admin/numbers'); const p = data?.provider, counts = data?.counts ?? {};
  return <div className="stack"><h1 style={{ margin: 0 }}>Numéros WhatsApp & Telegram</h1>
    {error && <p className="err" role="alert">{error}</p>}
    <div className="card"><h3 style={{ marginTop: 0 }}>Compte 5sim</h3>
      {loading ? <p className="mut">Chargement…</p> : p ? <div className="kv"><div>Solde <b>{p.balance}</b> <span className="mut">(dans la devise du compte 5sim)</span></div><div>Note <b>{p.rating}</b> {p.rating <= 20 ? <span className="err">— faible : au-dessous de 0, les achats sont bloqués 24 h</span> : null}</div><div>Commandes actives chez 5sim <b>{p.total_active_orders_count ?? 0}</b></div></div>
        : <p className="err" role="alert">Impossible de lire le compte 5sim : vérifiez la variable FIVESIM_API_KEY et la connexion au service.</p>}</div>
    <div className="card"><h3 style={{ marginTop: 0 }}>Commandes</h3><div className="kv">{Object.keys(ST).map(k => <div key={k}>{ST[k]} <b>{counts[k] ?? 0}</b></div>)}</div></div>
    <div className="card"><h3 style={{ marginTop: 0 }}>Dernières commandes</h3><div style={{ overflowX: 'auto' }}><table className="tbl"><thead><tr><th>Date</th><th>Utilisateur</th><th>Service</th><th>Pays</th><th>Statut</th><th>Prix</th><th>Coût 5sim</th><th>Détail</th></tr></thead><tbody>
      {(data?.recent ?? []).map((r: any) => <tr key={r.id}><td>{r.requestedAt ? day(new Date(r.requestedAt).toISOString()) : '—'}</td><td>{r.merchantId.slice(0, 8)}…</td><td>{r.service}</td><td>{r.country}</td><td>{ST[r.status] ?? r.status}</td><td>{usd(r.chargeUsd)} <span className="mut">({r.priceXof.toLocaleString('fr-FR')} XOF)</span></td><td>{r.providerPrice ?? '—'}</td><td>{r.error ?? ''}</td></tr>)}
      {!data?.recent?.length && !loading && <tr><td colSpan={8} className="mut">Aucune commande pour le moment.</td></tr>}</tbody></table></div></div></div>;
}
