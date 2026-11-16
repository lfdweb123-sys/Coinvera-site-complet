'use client';
import { api, useData } from '@/lib/client';
import { Badge, day, PageHead, usd } from '@/components/Bits';
import DataTable from '@/components/DataTable';
export default function W() {
  const { data, loading, reload } = useData('/api/admin/list?c=withdrawals');
  return <div className="stack"><PageHead title="Retraits" sub="« needs_review » = envoi à l’état inconnu (timeout). Remettre en file est sans risque de doublon : l’identifiant de retrait est unique." />
    <DataTable loading={loading} rows={data?.items ?? []} empty="Aucun retrait" cols={[{ key: 'coin', label: 'Actif', render: x => `${x.coin} · ${x.chain}` }, { key: 'merchantId', label: 'Marchand', render: x => <code>{x.merchantId}</code> }, { key: 'amountUnits', label: 'Montant', right: true, num: true, render: x => usd(x.amountUnits) }, { key: 'createdAt', label: 'Date', render: x => day(x.createdAt) }, { key: 'status', label: 'Statut', render: x => <Badge s={x.status} /> },
      { key: 'a', label: '', right: true, render: x => x.status === 'needs_review' && <button className="btn sm" onClick={async () => { await api('/api/admin/withdrawals/' + x.id, { method: 'POST' }); reload(); }}>Remettre en file</button> }]} /></div>;
}
