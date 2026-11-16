'use client';
import { useData } from '@/lib/client';
import { PageHead } from '@/components/Bits';
export default function Reports() {
  const { data } = useData('/api/transactions');
  function csv() {
    const r = [['id', 'date', 'titre', 'montant_usd', 'frais_traitement', 'frais_plateforme', 'commission_totale', 'net', 'statut'], ...(data?.items ?? []).map((x: any) => [x.id, x.createdAt, JSON.stringify(x.title ?? ''), x.amount, x.fees?.processing ?? '', x.fees?.platform ?? '', x.fees?.total ?? '', x.net ?? '', x.status])];
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([r.map(l => l.join(',')).join('\n')], { type: 'text/csv' })); a.download = 'coinvera-transactions.csv'; a.click();
  }
  return <div className="stack"><PageHead title="Rapports" sub="Exportez vos données financières." /><div className="card"><p>Exportez vos transactions (montant, commissions, net, statut) au format CSV.</p><button className="btn p" onClick={csv} disabled={!data?.items.length}>Exporter en CSV</button></div></div>;
}
