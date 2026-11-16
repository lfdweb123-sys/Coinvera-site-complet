'use client';
import { Lock, Percent, Wallet, Coins } from 'lucide-react';
import { useData } from '@/lib/client';
import { day, PageHead, Stat, usd } from '@/components/Bits';
import DataTable from '@/components/DataTable';
const T: Record<string, string> = { payment_settled: 'Paiement crédité', withdrawal_reserved: 'Retrait réservé', withdrawal_completed: 'Retrait terminé', withdrawal_released: 'Réservation libérée' };
export default function Bal() {
  const b = useData('/api/balance'), l = useData('/api/ledger'); const d = b.data;
  return <div className="stack"><PageHead title="Soldes" sub="Calculés à partir d’un registre comptable immuable." />
    <div className="grid"><Stat icon={Coins} label="Solde total" value={usd(String(Number(d?.available) + Number(d?.reserved)))} /><Stat icon={Wallet} label="Disponible" value={usd(d?.available)} /><Stat icon={Lock} label="Réservé (retraits en cours)" value={usd(d?.reserved)} /><Stat icon={Percent} label="Commissions payées" value={usd(d?.feesPaid)} /></div>
    <h3>Historique des mouvements</h3>
    <DataTable loading={l.loading} rows={l.data?.items ?? []} empty="Aucun mouvement" cols={[{ key: 'type', label: 'Opération', render: e => T[e.type] ?? e.type }, { key: 'createdAt', label: 'Date', render: e => day(e.createdAt) },
      { key: 'amount', label: 'Montant', right: true, num: true, render: e => { const m = e.lines.find((x: any) => x.account.startsWith('merchant:') && x.account.endsWith('available')) ?? e.lines.find((x: any) => x.account.startsWith('merchant:')); return m ? <span style={{ color: m.dir === 'credit' ? 'var(--ok)' : 'var(--ink)' }}>{m.dir === 'credit' ? '+' : '−'}{usd(m.amount)}</span> : '—'; } }]} /></div>;
}
