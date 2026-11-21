'use client';
import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api, msg, useData } from '@/lib/client';
import { Copy, day, PageHead } from '@/components/Bits';
import DataTable from '@/components/DataTable';
const MAX = 5;   // identique à MAX_WEBHOOKS (lib/webhook-urls.ts)
export default function Hooks() {
  const [page, setPage] = useState(1); const s = useData('/api/settings'), ev = useData(`/api/usage?type=webhooks&page=${page}&size=10`); const [urls, setUrls] = useState<string[]>(['']), [m, setM] = useState('');
  useEffect(() => { if (s.data) { const u: string[] = s.data.webhookUrls ?? (s.data.webhookUrl ? [s.data.webhookUrl] : []); setUrls(u.length ? u : ['']); } }, [s.data]);
  const set = (i: number, v: string) => setUrls(l => l.map((x, j) => j === i ? v : x));
  return <div className="stack"><PageHead title="Webhooks" sub="Recevez les événements de paiement sur un ou plusieurs serveurs." />
    <form className="card" onSubmit={async e => { e.preventDefault(); setM(''); try { await api('/api/settings', { method: 'PUT', body: JSON.stringify({ webhookUrls: urls.map(x => x.trim()).filter(Boolean) }) }); setM('Enregistré.'); s.reload(); } catch (x) { setM(msg(x)); } }}>
      <label style={{ marginTop: 0 }}>URL de notification (https) — {MAX} maximum</label>
      {urls.map((u, i) => <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input aria-label={`URL de notification ${i + 1}`} className="in" value={u} onChange={e => set(i, e.target.value)} placeholder="https://votre-site.com/coinvera-webhook" />
        <button type="button" className="btn" aria-label={`Retirer l’URL ${i + 1}`} onClick={() => setUrls(l => l.length > 1 ? l.filter((_, j) => j !== i) : [''])}><Trash2 size={16} /></button></div>)}
      {urls.length < MAX && <button type="button" className="btn" onClick={() => setUrls(l => [...l, ''])}><Plus size={16} />Ajouter une URL</button>}
      <p className="mut" style={{ marginTop: 10 }}>Chaque événement est envoyé à toutes les URL. Les plugins WordPress ajoutent automatiquement leur adresse ici lors de l’enregistrement de leurs réglages, sans effacer les autres. Chaque événement est signé : en-tête <code>X-Coinvera-Signature</code> = HMAC-SHA256 du corps brut avec votre secret (le même pour toutes les URL).</p>
      <label>Secret de signature</label><div style={{ display: 'flex', gap: 8 }}><input className="in" readOnly value={s.data?.webhookSecret ?? ''} /><Copy text={s.data?.webhookSecret ?? ''} /></div>
      <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}><button className="btn p">Enregistrer</button><span className="mut">{m}</span></div></form>
    <h3>Dernières livraisons</h3><DataTable loading={ev.loading} rows={ev.data?.items ?? []} empty="Aucune livraison" server={{ total: ev.data?.total ?? 0, page, size: 10, onPage: setPage }} cols={[{ key: 'type', label: 'Événement', render: x => <code>{x.type}</code> }, { key: 'host', label: 'Destination', render: x => x.host || '—' }, { key: 'status', label: 'Réponse', render: x => x.status ? `HTTP ${x.status}` : 'Échec' }, { key: 'createdAt', label: 'Date', render: x => day(x.createdAt) }]} /></div>;
}
