'use client';
import { useEffect, useState } from 'react';
import { api, msg, useData } from '@/lib/client';
import { usd, day } from '@/components/Bits';
import { useConfirm } from '@/components/Confirm';
const F: [string, string][] = [['marginBps', 'Marge sur le montant (points de base, 100 = 1 %)'], ['minGainUsd', 'Gain minimum par dépôt (USD)'], ['feeBps', 'Frais retenus par FeexPay sur un encaissement (points de base) : saisissez les frais réels'], ['bufferXofBps', 'Coussin de change FCFA (points de base)'], ['bufferNgnBps', 'Coussin de change NGN (points de base)'], ['floorXof', 'Taux plancher FCFA pour 1 USD (0 = aucun)'], ['floorNgn', 'Taux plancher NGN pour 1 USD (0 = aucun)'], ['depositMin', 'Dépôt minimum (USD)'], ['depositMax', 'Dépôt maximum (USD)']];
export default function Fiat() {
  const ask = useConfirm(); const { data, reload } = useData('/api/admin/fiat'); const [v, setV] = useState<any>({}), [m, setM] = useState('');
  useEffect(() => { if (data) setV(data.settings ?? {}); }, [data]);
  const resolve = async (id: string, decision: 'credit' | 'reject') => { if (!(await ask({ title: decision === 'credit' ? 'Créditer l’utilisateur ?' : 'Refuser ce dépôt ?', message: decision === 'credit' ? 'Vérifiez dans FeexPay que le paiement est bien reçu : le crédit complet sera ajouté.' : 'Aucun crédit ne sera ajouté.', danger: decision === 'reject' }))) return; try { await api('/api/admin/fiat', { method: 'POST', body: JSON.stringify({ action: 'resolve', id, decision }) }); reload(); } catch (x) { setM(msg(x)); } };
  return <div className="stack" style={{ maxWidth: 820 }}>
    <h1>Paiements mobile money et virement</h1>
    <div className="card stack"><h2 style={{ margin: 0 }}>État</h2>
      {!data?.configured && <p className="err" role="alert">FeexPay n’est pas configuré : ajoutez FEEXPAY_API_KEY et FEEXPAY_SHOP_ID dans l’environnement du site.</p>}
      <div className="kv"><div>Taux du jour (plus haut des sources) : <b>{data?.rates?.XOF ? `${data.rates.XOF.toFixed(2)} FCFA` : '—'}</b> · <b>{data?.rates?.NGN ? `${data.rates.NGN.toFixed(2)} NGN` : '—'}</b> pour 1 USD</div>
        <div>Dépôts crédités <b>{data?.stats?.fulfilled ?? '—'}</b> · total <b>{usd(data?.stats?.creditedUsd ?? 0)}</b> · gain estimé <b>{usd(data?.stats?.gainUsd ?? 0)}</b> · en attente <b>{data?.stats?.open ?? '—'}</b></div></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}><button className="btn" onClick={async () => { setM('…'); try { const r = await api('/api/admin/fiat', { method: 'POST', body: JSON.stringify({ action: 'reconcile' }) }); setM(`Rapprochement terminé : ${r.rows ?? 0} paiements lus, ${r.linked ?? 0} rattachés, ${r.checked ?? 0} revérifiés.`); reload(); } catch (x) { setM(msg(x)); } }}>Rapprocher avec FeexPay maintenant</button><small className="mut">Relit l’historique des 2 derniers jours (aussi fait automatiquement par la tâche planifiée).</small></div>
      <p className="mut">Webhook à renseigner chez FeexPay (mode Signature HMAC) : <code>https://www.coinvera.me/api/webhooks/feexpay</code> ; le secret fxp_whsec_… va dans FEEXPAY_WEBHOOK_SECRET. Chaque dépôt vous est signalé par e-mail ; l’argent arrive sur votre compte FeexPay : convertissez-le en USDT pour alimenter le portefeuille des cartes.</p></div>
    {!!data?.review?.length && <div className="card stack"><h2 style={{ margin: 0 }}>Dépôts à trancher</h2>
      <p className="mut">FeexPay annonce un montant inférieur à celui facturé. Vérifiez dans votre portail FeexPay puis tranchez.</p>
      {data.review.map((o: any) => <div key={o.id} className="kv"><div>{o.scope === 'scarab' ? 'Cartes pro' : 'Cartes virtuelles'} · {o.method} · {o.local} {o.label} → {usd(o.creditUsd)} · <small>{o.reason ?? ''} · réf. {o.reference ?? '—'}</small></div>
        <div style={{ display: 'flex', gap: 8 }}><button className="btn p" onClick={() => resolve(o.id, 'credit')}>Paiement vérifié : créditer</button><button className="btn" onClick={() => resolve(o.id, 'reject')}>Refuser</button></div></div>)}</div>}
    <form className="card stack" onSubmit={async e => { e.preventDefault(); setM(''); try { await api('/api/admin/fiat', { method: 'PUT', body: JSON.stringify({ enabled: !!v.enabled, ...Object.fromEntries(F.map(([k]) => [k, Number(v[k] ?? 0)])) }) }); setM('Réglages enregistrés.'); reload(); } catch (x) { setM(msg(x)); } }}>
      <h2 style={{ margin: 0 }}>Activation et prix</h2>
      <label><input type="checkbox" checked={!!v.enabled} onChange={e => setV({ ...v, enabled: e.target.checked })} /> Paiement par mobile money / virement activé (cartes virtuelles et Virtuals cards pro)</label>
      {F.map(([k, l]) => <div key={k}><label htmlFor={k}>{l}</label><input id={k} className="in" inputMode="decimal" value={v[k] ?? ''} onChange={e => setV({ ...v, [k]: e.target.value })} /></div>)}
      <p className="mut">Prix = (dollars demandés + marge + gain minimum) × taux × (1 + coussin) ÷ (1 − frais FeexPay), arrondi à l’unité supérieure. L’utilisateur reçoit exactement le montant en dollars (= USDT) demandé. Pour ne jamais perdre : les frais saisis doivent être les frais réels de FeexPay, et le coussin couvre la variation de la monnaie locale jusqu’à votre conversion en USDT.</p>
      {m && <p role="status" className={(m.startsWith('Réglages') || m.startsWith('Rapprochement')) ? 'okm' : 'err'}>{m}</p>}<button className="btn p">Enregistrer</button></form>
    {!!data?.recent?.length && <div className="card stack"><h2 style={{ margin: 0 }}>Derniers dépôts crédités</h2>{data.recent.map((o: any) => <div key={o.id}><small>{o.at ? day(o.at) : ''}</small> · {o.scope === 'scarab' ? 'Cartes pro' : 'Cartes virtuelles'} · {o.method} · {o.local} {o.label} → <b>{usd(o.creditUsd)}</b> · gain ≈ {usd(o.gainUsd)}</div>)}</div>}
  </div>;
}
