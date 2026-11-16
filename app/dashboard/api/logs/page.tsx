'use client';
import { useData } from '@/lib/client';
import { day, PageHead } from '@/components/Bits';
import DataTable from '@/components/DataTable';
export default function Logs() {
  const { data, loading } = useData('/api/usage');
  return <div className="stack"><PageHead title="Journal des requêtes API" sub="Requêtes authentifiées. Aucun secret ni donnée sensible n’est enregistré." />
    <DataTable loading={loading} pageSize={15} rows={data?.items ?? []} empty="Aucune requête" cols={[{ key: 'method', label: 'Méthode', render: x => <code>{x.method}</code> }, { key: 'endpoint', label: 'Endpoint', render: x => <code>{x.endpoint}</code> }, { key: 'createdAt', label: 'Date', render: x => day(x.createdAt) }, { key: 'status', label: 'Statut' }]} /></div>;
}
