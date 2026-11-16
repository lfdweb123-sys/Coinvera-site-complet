'use client';
import { useState } from 'react';
import { useData } from '@/lib/client';
import { day, PageHead } from '@/components/Bits';
import DataTable from '@/components/DataTable';
export default function Logs() {
  const [page, setPage] = useState(1); const { data, loading } = useData(`/api/usage?page=${page}&size=20`);
  return <div className="stack"><PageHead title="Journal des requêtes API" sub="Requêtes authentifiées. Aucun secret ni donnée sensible n’est enregistré." />
    <DataTable loading={loading} rows={data?.items ?? []} empty="Aucune requête" server={{ total: data?.total ?? 0, page, size: 20, onPage: setPage }} cols={[{ key: 'method', label: 'Méthode', render: x => <code>{x.method}</code> }, { key: 'endpoint', label: 'Endpoint', render: x => <code>{x.endpoint}</code> }, { key: 'createdAt', label: 'Date', render: x => day(x.createdAt) }, { key: 'status', label: 'Statut' }]} /></div>;
}
