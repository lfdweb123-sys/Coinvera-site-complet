'use client';
import { api, useData } from '@/lib/client';
import { Badge, PageHead } from '@/components/Bits';
import DataTable from '@/components/DataTable';
export default function L() {
  const { data, loading, reload } = useData('/api/admin/list?c=woocommerce_licenses');
  return <div className="stack"><PageHead title="Licences WooCommerce" sub="Activations par site et révocation." />
    <DataTable loading={loading} rows={data?.items ?? []} empty="Aucune licence" cols={[{ key: 'key', label: 'Clé', render: l => <code>{l.key}</code> }, { key: 'merchantId', label: 'Marchand', render: l => <code>{l.merchantId}</code> }, { key: 'sites', label: 'Sites', render: l => `${l.sites.length}/${l.maxActivations}` }, { key: 'status', label: 'Statut', render: l => <Badge s={l.status} /> },
      { key: 'a', label: '', right: true, render: l => l.status === 'active' && <button className="btn d sm" onClick={async () => { if (confirm('Révoquer cette licence ?')) { await api('/api/admin/licenses/' + l.id, { method: 'DELETE' }); reload(); } }}>Révoquer</button> }]} /></div>;
}
