'use client';
import { useEffect, useState } from 'react';
import { api, msg, useData } from '@/lib/client';
import { Copy, day, PageHead } from '@/components/Bits';
import DataTable from '@/components/DataTable';
export default function Hooks() {
  const [page, setPage] = useState(1); const s = useData('/api/settings'), ev = useData(`/api/usage?type=webhooks&page=${page}&size=10`); const [url, setUrl] = useState(''), [m, setM] = useState('');
  useEffect(() => { if (s.data) setUrl(s.data.webhookUrl ?? ''); }, [s.data]);
  return <div className="stack"><PageHead title="Webhooks" sub="Recevez les événements de paiement sur votre serveur." />
    <form className="card" onSubmit={async e => { e.preventDefault(); setM(''); try { await api('/api/settings', { method: 'PUT', body: JSON.stringify({ webhookUrl: url || null }) }); setM('Enregistré.'); } catch (x) { setM(msg(x)); } }}>
      <label htmlFor="u" style={{ marginTop: 0 }}>URL de notification (https)</label><input id="u" className="in" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://votre-site.com/coinvera-webhook" />
      <p className="mut" style={{ marginTop: 10 }}>Chaque événement est signé : en-tête <code>X-Coinvera-Signature</code> = HMAC-SHA256 du corps brut avec votre secret.</p>
      <label>Secret de signature</label><div style={{ display: 'flex', gap: 8 }}><input className="in" readOnly value={s.data?.webhookSecret ?? ''} /><Copy text={s.data?.webhookSecret ?? ''} /></div>
      <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}><button className="btn p">Enregistrer</button><span className="mut">{m}</span></div></form>
    <h3>Dernières livraisons</h3><DataTable loading={ev.loading} rows={ev.data?.items ?? []} empty="Aucune livraison" server={{ total: ev.data?.total ?? 0, page, size: 10, onPage: setPage }} cols={[{ key: 'type', label: 'Événement', render: x => <code>{x.type}</code> }, { key: 'status', label: 'Réponse', render: x => x.status ? `HTTP ${x.status}` : 'Échec' }, { key: 'createdAt', label: 'Date', render: x => day(x.createdAt) }]} /></div>;
}
