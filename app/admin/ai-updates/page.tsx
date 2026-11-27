'use client';
import { useState } from 'react';
import { api, msg, useData } from '@/lib/client';
import { Err } from '@/components/Wizard';
// Nouveautés transmises à Coinvera AI (chat du tableau de bord et du site). Les entrées ajoutées ici s'ajoutent à celles du code (lib/ai/updates.ts).
export default function AiUpdates() {
  const { data, reload } = useData('/api/admin/kb-updates'); const [t, setT] = useState(''), [x, setX] = useState(''), [d, setD] = useState(new Date().toISOString().slice(0, 10)), [pub, setPub] = useState(true), [e, setE] = useState(''), [busy, setBusy] = useState(false);
  const add = async () => { setE(''); setBusy(true); try { await api('/api/admin/kb-updates', { method: 'POST', body: JSON.stringify({ date: d, title: t, text: x, public: pub }) }); setT(''); setX(''); reload(); } catch (z) { setE(msg(z)); } setBusy(false); };
  const off = async (id: string) => { setE(''); try { await api('/api/admin/kb-updates', { method: 'DELETE', body: JSON.stringify({ id }) }); reload(); } catch (z) { setE(msg(z)); } };
  return <div className="stack" style={{ maxWidth: 820 }}><h1>Nouveautés de l’assistant IA</h1>
    <p className="mut" style={{ margin: 0 }}>Ce que vous écrivez ici est transmis automatiquement à Coinvera AI (au plus tard 5 minutes après), sans modifier le code. Décrivez uniquement ce qui est réellement en place.</p>
    <div className="card stack"><label htmlFor="ud">Date</label><input id="ud" className="in" type="date" value={d} onChange={v => setD(v.target.value)} /><label htmlFor="ut">Titre</label><input id="ut" className="in" maxLength={120} value={t} onChange={v => setT(v.target.value)} /><label htmlFor="ux">Description (ce que l’utilisateur peut faire, où, limites)</label><textarea id="ux" className="in" rows={4} maxLength={600} value={x} onChange={v => setX(v.target.value)} />
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={pub} onChange={v => setPub(v.target.checked)} /> Visible aussi par l’assistant du site (visiteurs)</label><Err m={e} /><button className="btn p" disabled={busy || t.trim().length < 3 || x.trim().length < 10} onClick={add}>{busy ? 'Enregistrement…' : 'Ajouter la nouveauté'}</button></div>
    <div className="card stack"><h2 style={{ margin: 0 }}>Vues par l’assistant ({data?.seen?.length ?? 0})</h2>{(data?.seen ?? []).map((u: any, i: number) => <div key={i}><small className="mut">{u.date}{u.public ? ' · public' : ' · compte seulement'}</small><br /><b>{u.title}</b> — {u.text}</div>)}</div>
    {!!data?.items?.length && <div className="card stack"><h2 style={{ margin: 0 }}>Ajoutées ici</h2>{data.items.map((u: any) => <div key={u.id} className="kv"><div><small className="mut">{u.date}{u.active ? '' : ' · retirée'}</small><br /><b>{u.title}</b></div>{u.active && <button className="btn sm d" onClick={() => off(u.id)}>Retirer</button>}</div>)}</div>}</div>;
}
