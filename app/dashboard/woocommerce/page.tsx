'use client';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { useData } from '@/lib/client';
import { Badge, Copy, PageHead } from '@/components/Bits';
import DataTable from '@/components/DataTable';
export default function Woo() {
  const { data, loading, reload } = useData('/api/license/purchase'); const pr = useData('/api/pricing');
  return <div className="stack"><PageHead title="Plugin WooCommerce" sub="Licence, téléchargement et sites activés."><a className="btn" href="/downloads/coinvera-crypto-gateway.zip"><Download size={16} />Télécharger le plugin</a></PageHead>
    <div className="card"><h3>Licence — {pr.data?.pluginPriceUsd ?? 50} USD</h3><p className="mut" style={{ margin: '8px 0 14px' }}>Liée à votre compte. Installez le plugin, saisissez votre clé de licence et vos clés API.</p>
      <Link className="btn p" href="/dashboard/activate?for=plugin">Acheter une licence</Link></div>
    <DataTable loading={loading} rows={data?.items ?? []} empty="Aucune licence" emptyHint="La licence apparaît après confirmation du paiement." toolbar={<><b>Mes licences</b><button className="btn sm" onClick={reload}>Actualiser</button></>}
      cols={[{ key: 'key', label: 'Clé', render: l => <><code>{l.key}</code> <Copy text={l.key} /></> }, { key: 'status', label: 'Statut', render: l => <Badge s={l.status} /> }, { key: 'sites', label: 'Sites', render: l => `${l.sites.length}/${l.maxActivations} · ${l.sites.join(', ') || 'aucun'}` }]} /></div>;
}
