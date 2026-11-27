'use client';
import { useData } from '@/lib/client';
import { day } from '@/components/Bits';
// Suivi du compte revendeur ProxNum : un solde vide bloque tous les achats (les utilisateurs sont alors remboursés automatiquement).
const ST: Record<string, string> = { reserved: 'Achat en cours', review: 'À vérifier', confirmed: 'Confirmé', failed: 'Remboursé' };
const KIND: Record<string, string> = { virtual: 'Numéro temporaire', rental: 'Location', extend: 'Prolongation' };
const usd = (n: string | number) => Number(n).toLocaleString('fr-FR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export default function AdminProxnum() {
  const { data, error, loading } = useData('/api/admin/proxnum'), counts = data?.counts ?? {};
  return <div className="stack"><h1 style={{ margin: 0 }}>Numéros ProxNum</h1>{error && <p className="err" role="alert">{error}</p>}
    <div className="card"><h3 style={{ marginTop: 0 }}>Compte ProxNum</h3>{loading ? <p className="mut">Chargement…</p> : !data?.enabled ? <p className="mut">Module inactif : renseignez PROXNUM_API_KEY dans l’environnement.</p> : data.balance != null ? <div className="kv"><div>Solde revendeur <b>{usd(data.balance)}</b> {data.balance < 10 ? <span className="err">— faible : rechargez pour ne pas bloquer les achats</span> : null}</div></div> : <p className="err" role="alert">Impossible de lire le solde : vérifiez PROXNUM_API_KEY et la connexion à ProxNum.</p>}</div>
    <div className="card"><h3 style={{ marginTop: 0 }}>Commandes et marge</h3><div className="kv">{Object.keys(ST).map(k => <div key={k}>{ST[k]} <b>{counts[k] ?? 0}</b></div>)}</div>
      <div className="kv"><div>Ventes confirmées <b>{usd(data?.revenue ?? 0)}</b> · marge réalisée <b>{usd(data?.margin ?? 0)}</b></div><div className="mut">Marge appliquée : +{((data?.markupBps ?? 0) / 100).toLocaleString('fr-FR')} % sur le prix ProxNum{Number(data?.markupFlat) ? ` + ${usd(data.markupFlat)}` : ''} (réglable par PROXNUM_MARKUP_BPS et PROXNUM_MARKUP_FLAT_USD).</div></div></div>
    <div className="card"><h3 style={{ marginTop: 0 }}>Dernières commandes</h3><div style={{ overflowX: 'auto' }}><table className="tbl"><thead><tr><th>Date</th><th>Utilisateur</th><th>Type</th><th>Service</th><th>Pays</th><th>Statut</th><th>Prix</th><th>Coût ProxNum</th><th>Détail</th></tr></thead><tbody>
      {(data?.recent ?? []).map((r: any) => <tr key={r.id}><td>{r.at ? day(new Date(r.at).toISOString()) : '—'}</td><td>{r.merchantId}…</td><td>{KIND[r.kind] ?? r.kind}</td><td>{r.service ?? '—'}</td><td>{r.country ?? '—'}</td><td>{ST[r.status] ?? r.status}</td><td>{usd(r.charge)}</td><td>{usd(r.cost)}</td><td>{r.error ?? ''}</td></tr>)}
      {!data?.recent?.length && !loading && <tr><td colSpan={9} className="mut">Aucune commande pour le moment.</td></tr>}</tbody></table></div></div></div>;
}
