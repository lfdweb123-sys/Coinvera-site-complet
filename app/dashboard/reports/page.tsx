'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import { PageHead } from '@/components/Bits';
export default function Reports() {
  const [busy, setBusy] = useState(false);
  async function csv() {
    setBusy(true); const all: any[] = [];
    for (let p = 1; p <= 100; p++) { const r = await api(`/api/transactions?page=${p}&size=100`); all.push(...r.items); if (all.length >= r.total) break; }
    const rows = [['id', 'date', 'titre', 'montant_usd', 'frais_traitement', 'frais_plateforme', 'commission_totale', 'net', 'statut'], ...all.map((x: any) => [x.id, x.createdAt, JSON.stringify(x.title ?? ''), x.amount, x.fees?.processing ?? '', x.fees?.platform ?? '', x.fees?.total ?? '', x.net ?? '', x.status])];
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.map(l => l.join(',')).join('\n')], { type: 'text/csv' })); a.download = 'coinvera-transactions.csv'; a.click(); setBusy(false);
  }
  return <div className="stack"><PageHead title="Rapports" sub="Exportez vos données financières." /><div className="card"><p>Exportez toutes vos transactions (montant, commissions, net, statut) au format CSV.</p><button className="btn p" onClick={csv} disabled={busy}>{busy ? 'Export en cours…' : 'Exporter en CSV'}</button></div></div>;
}
