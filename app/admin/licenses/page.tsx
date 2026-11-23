'use client';
import { api, useData } from '@/lib/client';
import { Badge, PageHead } from '@/components/Bits';
import { useConfirm } from '@/components/Confirm';
import { useBulk } from '@/components/Bulk';
import DataTable from '@/components/DataTable';
export default function L() {
  const { data, loading, reload } = useData('/api/admin/list?c=woocommerce_licenses'); const ask = useConfirm(); const bulk = useBulk({ c: 'woocommerce_licenses', rows: data?.items ?? [], reload, label: 'licence', revoke: true, canRevoke: (l: any) => l.status === 'active' });
  return <div className="stack"><PageHead title="Licences WooCommerce" sub="Activations par site et révocation." />
    {bulk.status}<DataTable loading={loading} rows={data?.items ?? []} empty="Aucune licence" toolbar={bulk.toolbar} cols={[...bulk.pre, { key: 'key', label: 'Clé', render: l => <code>{l.key}</code> }, { key: 'merchantId', label: 'Marchand', render: l => <code>{l.merchantId}</code> }, { key: 'sites', label: 'Sites', render: l => `${l.sites.length}/${l.maxActivations}` }, { key: 'status', label: 'Statut', render: l => <Badge s={l.status} /> },
      { key: 'a', label: '', right: true, render: l => l.status === 'active' && <button className="btn d sm" onClick={async () => { if (await ask({ title: 'Révoquer cette licence ?', message: 'Le plugin concerné cessera de fonctionner.', confirmLabel: 'Révoquer', danger: true })) { await api('/api/admin/licenses/' + l.id, { method: 'DELETE' }); reload(); } }}>Révoquer</button> }, ...bulk.post]} /></div>;
}
