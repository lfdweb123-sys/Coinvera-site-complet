'use client';
import { useState } from 'react';
import { Download } from 'lucide-react';
import { api, msg, useData } from '@/lib/client';
import { Badge, Copy, PageHead } from '@/components/Bits';
import DataTable from '@/components/DataTable';
export default function Woo() {
  const { data, loading, reload } = useData('/api/license/purchase'); const pr = useData('/api/pricing'); const [err, setErr] = useState('');
  return <div className="stack"><PageHead title="Plugin WooCommerce" sub="Licence, téléchargement et sites activés."><a className="btn" href="/downloads/coinvera-crypto-gateway.zip"><Download size={16} />Télécharger le plugin</a></PageHead>
    <div className="card"><h3>Licence — {pr.data?.pluginPriceUsd ?? 50} USD</h3><p className="mut" style={{ margin: '8px 0 14px' }}>Liée à votre compte. Installez le plugin, saisissez votre clé de licence et vos clés API.</p>
      <button className="btn p" onClick={async () => { setErr(''); try { location.href = (await api('/api/license/purchase', { method: 'POST' })).checkoutUrl; } catch (e) { setErr(msg(e)); } }}>Acheter une licence</button>{err && <div className="err">{err}</div>}</div>
    <DataTable loading={loading} rows={data?.items ?? []} empty="Aucune licence" emptyHint="La licence apparaît après confirmation du paiement." toolbar={<><b>Mes licences</b><button className="btn sm" onClick={reload}>Actualiser</button></>}
      cols={[{ key: 'key', label: 'Clé', render: l => <><code>{l.key}</code> <Copy text={l.key} /></> }, { key: 'status', label: 'Statut', render: l => <Badge s={l.status} /> }, { key: 'sites', label: 'Sites', render: l => `${l.sites.length}/${l.maxActivations} · ${l.sites.join(', ') || 'aucun'}` }]} /></div>;
}
