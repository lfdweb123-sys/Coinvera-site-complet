'use client';
import { useEffect, useState } from 'react';
import { api, msg, useData } from '@/lib/client';
const F: [string, string][] = [['platformFeeBps', 'Commission plateforme (points de base, 150 = 1,5 %)'], ['processingFeeBps', 'Frais de traitement affichés (points de base)'], ['apiActivationUsd', 'Prix d’activation unique : API + plugin (USD)'], ['minWithdrawalUsd', 'Retrait minimum (USD)'], ['maxWithdrawalUsd', 'Retrait maximum (USD)'], ['withdrawalFeeTRX', 'Frais de retrait TRC20 (USDT)'], ['withdrawalFeeETH', 'Frais de retrait ERC20 (USDT)'], ['withdrawalFeeBSC', 'Frais de retrait BEP20 (USDT)'], ['freeTrials', 'Essais gratuits'], ['maxLicenseActivations', 'Sites par licence'], ['pluginVersion', 'Version du plugin publiée']];
const WA: [string, string][] = [['whatsappCartTemplate', 'Modèle Meta — relance panier'], ['whatsappStatusTemplate', 'Modèle Meta — statut de commande'], ['whatsappLang', 'Code langue du modèle (ex. fr)']];
const STR = new Set(['pluginVersion', 'whatsappCartTemplate', 'whatsappStatusTemplate', 'whatsappLang']);
export default function P() {
  const { data } = useData('/api/admin/pricing'); const [v, setV] = useState<any>({}), [m, setM] = useState('');
  useEffect(() => { if (data) setV(data); }, [data]);
  return <form className="card" style={{ maxWidth: 620 }} onSubmit={async e => { e.preventDefault(); setM(''); const b: any = {}; [...F, ...WA].forEach(([k]) => b[k] = STR.has(k) ? String(v[k]) : Number(v[k]));
    try { await api('/api/admin/pricing', { method: 'PUT', body: JSON.stringify(b) }); setM('Enregistré et historisé dans le journal d’audit.'); } catch (x) { setM(msg(x)); } }}>
    <h1 style={{ marginBottom: 8 }}>Tarifs & commissions</h1>{F.map(([k, l]) => <div key={k}><label htmlFor={k}>{l}</label><input id={k} className="in" value={v[k] ?? ''} onChange={e => setV({ ...v, [k]: e.target.value })} /></div>)}
    <p className="mut">Commission totale affichée : {((Number(v.platformFeeBps) + Number(v.processingFeeBps)) / 100).toFixed(2)} %. Le crédit marchand utilise les frais réels de traitement confirmés.</p>
    <h2 style={{ margin: '20px 0 8px' }}>Relances WhatsApp</h2>
    <p className="mut" style={{ marginTop: 0 }}>Modèles pré-approuvés par Meta, partagés par tous les marchands (voir Business Manager).</p>
    {WA.map(([k, l]) => <div key={k}><label htmlFor={k}>{l}</label><input id={k} className="in" value={v[k] ?? ''} onChange={e => setV({ ...v, [k]: e.target.value })} /></div>)}
    <button className="btn p">Enregistrer</button> <span className="mut">{m}</span></form>;
}
