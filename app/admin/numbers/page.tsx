'use client';
import { useState } from 'react';
import { api, msg, useData } from '@/lib/client';
import { day } from '@/components/Bits';
// Suivi du compte 5sim : un solde vide bloque tous les achats (les utilisateurs sont alors remboursés), une note à 0 les bloque 24 h (« not enough rating »).
const ST: Record<string, string> = { reserved: 'Achat en cours', review: 'Vérification', waiting: 'En attente du code', received: 'Code reçu', failed: 'Remboursé' };
const usd = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export default function AdminNumbers() {
  const [page, setPage] = useState(1), [product, setProduct] = useState('whatsapp'), [price, setPrice] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const { data, error, loading, reload } = useData(`/api/admin/numbers?page=${page}`); const p = data?.provider, counts = data?.counts ?? {}, lim = data?.limits;
  const act = async (method: 'POST' | 'DELETE', body: unknown) => { setErr(''); setBusy(true); try { await api('/api/admin/numbers/max-prices', { method, body: JSON.stringify(body) }); reload(); } catch (e) { setErr(msg(e)); } finally { setBusy(false); } };
  const pages = Math.max(1, Math.ceil(((data?.history?.Total ?? 0) || (data?.payments?.Total ?? 0)) / (data?.size ?? 15)));
  return <div className="stack"><h1 style={{ margin: 0 }}>Numéros WhatsApp & Telegram</h1>
    {error && <p className="err" role="alert">{error}</p>}
    {data?.notice && <div className="card" role="status"><b>Notification de 5sim</b><p style={{ margin: '6px 0 0' }}>{data.notice}</p></div>}
    {lim?.bannedUntil && <div className="card err" role="alert"><b>Bannissement de 10 minutes en cours</b> (limite de requêtes de 5sim atteinte 5 fois en 10 minutes) jusqu’à {new Date(lim.bannedUntil).toLocaleTimeString('fr-FR')} : les achats sont refusés et remboursés.</div>}
    <div className="card"><h3 style={{ marginTop: 0 }}>Compte 5sim</h3>
      {loading ? <p className="mut">Chargement…</p> : p ? <div className="kv"><div>Solde <b>{p.balance}</b> <span className="mut">(devise du compte 5sim)</span>{p.frozen_balance ? <span className="mut"> · gelé {p.frozen_balance}</span> : null}</div><div>Note <b>{p.rating}</b> / 96 {p.rating <= 20 ? <span className="err">— faible : à zéro, les achats sont bloqués 24 h</span> : null}</div>
        {p.default_country?.name ? <div className="mut">Pays par défaut : {p.default_country.name} {p.default_country.prefix ?? ''}</div> : null}{p.default_forwarding_number ? <div className="mut">Numéro de renvoi par défaut : +{p.default_forwarding_number}</div> : null}{p.vendor ? <div className="mut">Vendeur : {p.vendor}</div> : null}</div>
        : <p className="err" role="alert">Impossible de lire le compte 5sim : vérifiez la variable FIVESIM_API_KEY et la connexion au service.</p>}</div>
    <div className="card"><h3 style={{ marginTop: 0 }}>Limites de prix chez 5sim</h3><p className="mut" style={{ marginTop: 0 }}>5sim refuse tout achat plus cher que la limite du produit (devise du compte 5sim). Sans limite, aucun plafond.</p>
      <div style={{ overflowX: 'auto' }}><table className="tbl"><thead><tr><th>Produit</th><th>Limite</th><th>Créée</th><th /></tr></thead><tbody>
        {(data?.maxPrices ?? []).map((m: any) => <tr key={m.id}><td>{m.product}</td><td>{m.price}</td><td>{m.created_at ? day(m.created_at) : '—'}</td><td><button className="btn sm" disabled={busy} onClick={() => act('DELETE', { product: m.product })}>Supprimer</button></td></tr>)}
        {!data?.maxPrices?.length && <tr><td colSpan={4} className="mut">Aucune limite définie.</td></tr>}</tbody></table></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}><select className="in" style={{ maxWidth: 180 }} value={product} onChange={e => setProduct(e.target.value)} aria-label="Produit"><option value="whatsapp">whatsapp</option><option value="telegram">telegram</option></select>
        <input className="in" style={{ maxWidth: 160 }} inputMode="decimal" placeholder="Limite" value={price} onChange={e => setPrice(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))} aria-label="Limite de prix" />
        <button className="btn p" disabled={busy || !Number(price)} onClick={() => act('POST', { product, price: Number(price) })}>Créer ou modifier</button></div>{err && <p className="err" role="alert">{err}</p>}</div>
    <div className="card"><h3 style={{ marginTop: 0 }}>Commandes chez nous</h3><div className="kv">{Object.keys(ST).map(k => <div key={k}>{ST[k]} <b>{counts[k] ?? 0}</b></div>)}</div></div>
    <div className="card"><h3 style={{ marginTop: 0 }}>Dernières commandes</h3><div style={{ overflowX: 'auto' }}><table className="tbl"><thead><tr><th>Date</th><th>Utilisateur</th><th>Service</th><th>Pays</th><th>Statut</th><th>Prix</th><th>Coût 5sim</th><th>Détail</th></tr></thead><tbody>
      {(data?.recent ?? []).map((r: any) => <tr key={r.id}><td>{r.requestedAt ? day(new Date(r.requestedAt).toISOString()) : '—'}</td><td>{r.merchantId.slice(0, 8)}…</td><td>{r.service}</td><td>{r.country}</td><td>{ST[r.status] ?? r.status}</td><td>{usd(r.chargeUsd)} <span className="mut">({r.priceXof.toLocaleString('fr-FR')} XOF)</span></td><td>{r.providerPrice ?? '—'}</td><td>{r.error ?? ''}</td></tr>)}
      {!data?.recent?.length && !loading && <tr><td colSpan={8} className="mut">Aucune commande pour le moment.</td></tr>}</tbody></table></div></div>
    <div className="card"><h3 style={{ marginTop: 0 }}>Historique chez 5sim <span className="mut">· {data?.history?.Total ?? 0} commandes d’activation</span></h3><div style={{ overflowX: 'auto' }}><table className="tbl"><thead><tr><th>N°</th><th>Date</th><th>Produit</th><th>Pays</th><th>Opérateur</th><th>Statut</th><th>Prix</th></tr></thead><tbody>
      {(data?.history?.Data ?? []).map((o: any) => <tr key={o.id}><td>{o.id}</td><td>{o.created_at ? day(o.created_at) : '—'}</td><td>{o.product}</td><td>{o.country}</td><td>{o.operator ?? '—'}</td><td>{o.status}</td><td>{o.price}</td></tr>)}
      {!data?.history?.Data?.length && !loading && <tr><td colSpan={7} className="mut">Aucune commande.</td></tr>}</tbody></table></div></div>
    <div className="card"><h3 style={{ marginTop: 0 }}>Paiements du compte 5sim <span className="mut">· {data?.payments?.Total ?? 0}</span></h3><div style={{ overflowX: 'auto' }}><table className="tbl"><thead><tr><th>N°</th><th>Date</th><th>Type</th><th>Moyen</th><th>Montant</th><th>Solde après</th></tr></thead><tbody>
      {(data?.payments?.Data ?? []).map((x: any) => <tr key={x.ID}><td>{x.ID}</td><td>{x.CreatedAt ? day(x.CreatedAt) : '—'}</td><td>{x.TypeName}</td><td>{x.ProviderName}</td><td>{x.Amount}</td><td>{x.Balance}</td></tr>)}
      {!data?.payments?.Data?.length && !loading && <tr><td colSpan={6} className="mut">Aucun paiement.</td></tr>}</tbody></table></div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Précédent</button><span className="mut" style={{ alignSelf: 'center' }}>Page {page} / {pages}</span><button className="btn sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Suivant</button></div></div></div>;
}
