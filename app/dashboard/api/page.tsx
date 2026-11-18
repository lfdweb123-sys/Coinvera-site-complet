'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api, msg, useData } from '@/lib/client';
import { Badge, Copy, day, PageHead } from '@/components/Bits';
import { useConfirm } from '@/components/Confirm';
import DataTable from '@/components/DataTable';
export default function Keys() {
  const { data, loading, reload } = useData('/api/keys'); const pr = useData('/api/pricing'); const ask = useConfirm();
  const [secret, setSecret] = useState<any>(null), [err, setErr] = useState('');
  const act = data?.activation ?? {}; const left = Math.max(0, (pr.data?.freeTrials ?? 2) - (act.trialsUsed ?? 0));
  const state = act.activated ? 'API activée' : left > 0 ? `Mode test : ${left} essai(s) gratuit(s) restant(s)` : 'En attente d’activation';
  const run = async (f: () => Promise<any>) => { setErr(''); try { await f(); } catch (e) { setErr(msg(e)); } };
  return <div className="stack"><PageHead title="API & Développeurs" sub="Clés, activation et journal des requêtes."><Link className="btn" href="/dashboard/api/logs">Journal des requêtes</Link></PageHead>
    <div className="card"><div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><h3>{state}</h3>{act.activated ? <Badge s="active" /> : <Badge s="pending" />}</div>
      <p className="mut" style={{ margin: '8px 0 14px' }}>Deux essais gratuits (opérations de test). Ensuite, un paiement unique de {pr.data?.apiActivationUsd ?? 50} USD active la production ; l’accès n’est activé qu’après confirmation du paiement côté serveur.</p>
      {!act.activated && <Link className="btn p" href="/dashboard/activate">Activer mon compte</Link>}</div>
    {secret && <div className="card" style={{ borderColor: 'var(--brand)', borderWidth: 2 }}><b>Conservez ce secret maintenant : il ne sera plus affiché.</b><div className="code" style={{ margin: '12px 0', wordBreak: 'break-all' }}>{secret.publicKey}<br />{secret.secret}</div><div style={{ display: 'flex', gap: 8 }}><Copy text={secret.secret} /><button className="btn sm" onClick={() => setSecret(null)}>J’ai copié le secret</button></div></div>}
    {err && <div className="err" role="alert">{err}</div>}
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><button className="btn p" onClick={() => run(async () => { setSecret(await api('/api/keys', { method: 'POST', body: JSON.stringify({ mode: 'test' }) })); reload(); })}>Nouvelle clé test</button>
      <button className="btn" disabled={!act.activated} onClick={() => run(async () => { setSecret(await api('/api/keys', { method: 'POST', body: JSON.stringify({ mode: 'live' }) })); reload(); })}>Nouvelle clé production</button></div>
    <DataTable loading={loading} rows={data?.keys ?? []} empty="Aucune clé" emptyHint="Générez une clé test pour commencer." cols={[{ key: 'publicKey', label: 'Clé publique', render: k => <code style={{ wordBreak: 'break-all' }}>{k.publicKey}</code> }, { key: 'mode', label: 'Environnement', render: k => <Badge s={k.mode} /> }, { key: 'createdAt', label: 'Créée', render: k => day(k.createdAt) }, { key: 'lastUsedAt', label: 'Dernière utilisation', render: k => day(k.lastUsedAt) }, { key: 'status', label: 'Statut', render: k => <Badge s={k.status} /> },
      { key: 'a', label: '', right: true, render: k => k.status === 'active' && <button className="btn d sm" onClick={async () => { if (await ask({ title: 'Révoquer cette clé ?', message: 'Effet immédiat : toute application utilisant cette clé cessera de fonctionner.', confirmLabel: 'Révoquer', danger: true })) run(async () => { await api('/api/keys/' + k.id, { method: 'DELETE' }); reload(); }); }}>Révoquer</button> }]} />
    <p className="mut">Pour régénérer une clé : créez-en une nouvelle puis révoquez l’ancienne.</p></div>;
}
