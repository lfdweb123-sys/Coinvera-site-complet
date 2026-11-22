'use client';
import { useEffect, useState } from 'react';
import { api, msg, useData } from '@/lib/client';
import { usd } from '@/components/Bits';
import { useConfirm } from '@/components/Confirm';
const F: [string, string][] = [['issueFlat', 'Marge fixe à l’émission (USD)'], ['issueBps', 'Marge à l’émission, sur le solde d’ouverture (points de base, 100 = 1 %)'], ['loadFlat', 'Marge fixe par recharge (USD)'], ['loadBps', 'Marge par recharge, sur le montant (points de base, 100 = 1 %)']];
const NETS = ['TRC20', 'BEP20', 'ERC20', 'POLYGON'];
export default function CartePro() {
  const ask = useConfirm(); const { data, reload } = useData('/api/admin/scarab'); const [wdNet, setWdNet] = useState<Record<string, string>>({}); const [v, setV] = useState<any>({}), [m, setM] = useState(''), [net, setNet] = useState('TRC20'), [dm, setDm] = useState('');
  useEffect(() => { if (data) setV(data.settings ?? {}); }, [data]);
  const toggleHidden = (id: string) => { const h: string[] = v.hidden ?? []; setV({ ...v, hidden: h.includes(id) ? h.filter(x => x !== id) : [...h, id] }); };
  const resolve = async (orderId: string, decision: 'confirm' | 'refund') => { if (!(await ask({ title: decision === 'confirm' ? 'Confirmer la carte ?' : 'Rembourser l’utilisateur ?', message: decision === 'confirm' ? 'La carte existe et les fonds sont dépensés.' : 'Les fonds retournent sur son solde Coinvera.', danger: decision === 'refund' }))) return; try { await api('/api/admin/scarab', { method: 'POST', body: JSON.stringify({ action: 'resolve', orderId, decision }) }); reload(); } catch (x) { setM(msg(x)); } };
  const w = data?.wallet;
  return <div className="stack" style={{ maxWidth: 820 }}>
    <h1>Carte Pro</h1>
    <div className="card stack"><h2 style={{ margin: 0 }}>Portefeuille du programme</h2>
      {data?.error && <p className="err" role="alert">Prestataire injoignable ou non configuré ({data.error}).</p>}
      {w && <div className="kv"><div>Solde disponible <b>{usd(w.availableMinor / 100)}</b></div><div>Clé <b>{w.mode === 'live' ? 'Production' : 'Test'}</b> · vérification <b>{w.verification}</b></div>{w.plan && <div>Offre <b>{w.plan.name ?? '—'}</b>{w.plan.monthly_fee_minor ? ` (${usd(w.plan.monthly_fee_minor / 100)}/mois)` : ''} · cartes actives <b>{w.plan.live_cards_held ?? 0}/{w.plan.card_limit ?? '—'}</b></div>}</div>}
      {data?.addresses?.map((a: any, i: number) => <div key={i}><small>{a.network ?? a.asset ?? ''} :</small> <code style={{ wordBreak: 'break-all' }}>{a.address}</code></div>)}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}><select className="in" aria-label="Réseau" style={{ width: 'auto' }} value={net} onChange={e => setNet(e.target.value)}>{NETS.map(n => <option key={n}>{n}</option>)}</select>
        <button className="btn" onClick={async () => { setDm(''); try { await api('/api/admin/scarab', { method: 'POST', body: JSON.stringify({ action: 'deposit-address', network: net }) }); reload(); } catch (x) { setDm(msg(x)); } }}>Créer une adresse de dépôt</button><span className="mut">{dm}</span></div>
      <p className="mut">Chaque carte et chaque recharge est payée par ce portefeuille : alimentez-le. Opérations en cours : {data?.pendingOrders ?? '—'} · frais de pénalité facturés par le prestataire (non répercutés) : <b>{usd(data?.chargedFees ?? 0)}</b> ({data?.feeCount ?? 0}).</p></div>
    {!!data?.reviewOrders?.length && <div className="card stack"><h2 style={{ margin: 0 }}>Opérations à trancher</h2>
      <p className="mut">Résultat resté incertain après 20 h. Vérifiez dans le portail du prestataire si la carte ou la recharge existe, puis tranchez.</p>
      {data.reviewOrders.map((o: any) => <div key={o.id} className="kv"><div>{o.kind === 'issue' ? 'Création' : 'Recharge'} · {usd(o.amount)} (payé {usd(o.total)}) · <small>{o.id}</small></div>
        <div style={{ display: 'flex', gap: 8 }}><button className="btn p" onClick={() => resolve(o.id, 'confirm')}>La carte existe : confirmer</button><button className="btn" onClick={() => resolve(o.id, 'refund')}>Rien n’a été créé : rembourser</button></div></div>)}</div>}
    {!!data?.reviewWithdrawals?.length && <div className="card stack"><h2 style={{ margin: 0 }}>Retraits de carte à vérifier</h2>
      <p className="mut">Sans confirmation du prestataire après 2 h. Lisez le montant net crédité à votre portefeuille dans le portail, puis saisissez-le (0 si rien n’a été débité de la carte : le retrait sera clos sans crédit).</p>
      {data.reviewWithdrawals.map((o: any) => <div key={o.id} className="kv"><div>Retrait de {usd(o.amount)} · carte <small>{o.cardId}</small></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><input className="in" style={{ width: 150 }} inputMode="decimal" placeholder="Net crédité (USD)" aria-label="Montant net crédité" value={wdNet[o.id] ?? ''} onChange={e => setWdNet({ ...wdNet, [o.id]: e.target.value })} />
          <button className="btn p" disabled={!/^\d{1,6}(\.\d{1,2})?$/.test(wdNet[o.id] ?? '')} onClick={async () => { try { await api('/api/admin/scarab', { method: 'POST', body: JSON.stringify({ action: 'wd-resolve', id: o.id, netMinor: Math.round(Number(wdNet[o.id]) * 100) }) }); reload(); } catch (x) { setM(msg(x)); } }}>Confirmer avec le net</button>
          <button className="btn" onClick={async () => { if (!(await ask({ title: 'Clore sans crédit ?', message: 'Aucun montant ne sera ajouté au solde de l’utilisateur.', danger: true }))) return; try { await api('/api/admin/scarab', { method: 'POST', body: JSON.stringify({ action: 'wd-resolve', id: o.id, netMinor: null }) }); reload(); } catch (x) { setM(msg(x)); } }}>Clore sans crédit</button></div></div>)}</div>}
    <form className="card stack" onSubmit={async e => { e.preventDefault(); setM(''); try { await api('/api/admin/scarab', { method: 'PUT', body: JSON.stringify({ enabled: !!v.enabled, issueFlat: Number(v.issueFlat ?? 0), issueBps: Number(v.issueBps ?? 0), loadFlat: Number(v.loadFlat ?? 0), loadBps: Number(v.loadBps ?? 0), hidden: v.hidden ?? [] }) }); setM('Enregistré et historisé dans le journal d’audit.'); reload(); } catch (x) { setM(msg(x)); } }}>
      <h2 style={{ margin: 0 }}>Activation et marge</h2>
      <label><input type="checkbox" checked={!!v.enabled} onChange={e => setV({ ...v, enabled: e.target.checked })} /> Carte Pro activée pour les utilisateurs</label>
      {F.map(([k, l]) => <div key={k}><label htmlFor={k}>{l}</label><input id={k} className="in" inputMode="decimal" value={v[k] ?? ''} onChange={e => setV({ ...v, [k]: e.target.value })} /></div>)}
      <p className="mut">Prix garanti : le prix client est calculé sur le tarif Starter (le plus cher de toutes les offres) + votre marge. Si vous changez d’offre, vos coûts baissent et la marge ne peut que croître. Une commande est refusée si son prix passait sous le coût réel.</p>
      {!!data?.products?.length && <><h3 style={{ marginBottom: 0 }}>Produits</h3>{data.products.map((p: any) => <div key={p.id} className="card stack"><label><input type="checkbox" checked={!(v.hidden ?? []).includes(p.id)} onChange={() => toggleHidden(p.id)} /> <b>{p.name}</b> ({p.category}) visible</label>
        <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', fontSize: 13 }}><thead><tr><th align="left">Montant</th><th>Émission : prix</th><th>coût</th><th>gain</th><th>Recharge : prix</th><th>coût</th><th>gain</th></tr></thead>
          <tbody>{p.rows.map((r: any) => <tr key={r.amount} style={{ textAlign: "center" }}><td align="left">{usd(r.amount)}</td><td>{usd(r.issuePrice)}</td><td>{r.issueCost == null ? '—' : usd(r.issueCost)}</td><td>{r.issueGain == null ? '—' : usd(r.issueGain)}</td><td>{usd(r.topupPrice)}</td><td>{r.topupCost == null ? '—' : usd(r.topupCost)}</td><td>{r.topupGain == null ? '—' : usd(r.topupGain)}</td></tr>)}</tbody></table></div></div>)}</>}
      <button className="btn p">Enregistrer</button> <span className="mut">{m}</span></form></div>;
}
