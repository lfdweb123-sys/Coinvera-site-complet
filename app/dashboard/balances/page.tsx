'use client';
import { Lock, Percent, Wallet, Coins } from 'lucide-react';
import { useState } from 'react';
import { useData } from '@/lib/client';
import { day, PageHead, Stat, usd } from '@/components/Bits';
import DataTable from '@/components/DataTable';
import TopupModal from '@/components/TopupModal';
const T: Record<string, string> = { payment_settled: 'Paiement crédité', withdrawal_reserved: 'Retrait réservé', withdrawal_completed: 'Retrait terminé', withdrawal_released: 'Réservation libérée', admin_adjustment: 'Ajustement par Coinvera', proxnum_reserve: 'Numéro virtuel (réservation)', proxnum_done: 'Numéro virtuel (achat confirmé)', proxnum_release: 'Numéro virtuel (réservation libérée)', proxnum_refund: 'Numéro virtuel remboursé', esim_reserve: 'eSIM (réservation)', esim_done: 'eSIM (achat confirmé)', esim_release: 'eSIM (réservation libérée)', esim_refund: 'eSIM remboursée', topup: 'Recharge du solde' };
const POOL: Record<string, string> = { card_credit: 'crédit cartes virtuelles', scarab_credit: 'crédit Virtuals cards pro' };
export default function Bal() {
  const [page, setPage] = useState(1); const b = useData('/api/balance'), l = useData(`/api/ledger?page=${page}&size=10`); const d = b.data; const [top, setTop] = useState(false);
  return <div className="stack"><PageHead title="Soldes" sub="Calculés à partir d’un registre comptable immuable." />
    <div className="btns"><button type="button" className="btn p" onClick={() => setTop(true)}>Recharger mon solde</button></div>
    {top && <TopupModal onClose={() => setTop(false)} onDone={() => { b.reload?.(); l.reload?.(); }} />}
    <div className="g4"><Stat icon={Coins} label="Solde total" value={usd(String(Number(d?.available) + Number(d?.reserved)))} /><Stat icon={Wallet} label="Disponible" value={usd(d?.available)} /><Stat icon={Lock} label="Réservé (retraits en cours)" value={usd(d?.reserved)} /><Stat icon={Percent} label="Commissions payées" value={usd(d?.feesPaid)} /></div>
    <h3>Historique des mouvements</h3>
    <DataTable loading={l.loading} rows={l.data?.items ?? []} empty="Aucun mouvement" server={{ total: l.data?.total ?? 0, page, size: 10, onPage: setPage }} cols={[{ key: 'type', label: 'Opération', render: e => (T[e.type] ?? e.type) + (e.type === 'admin_adjustment' && POOL[e.pool] ? ' — ' + POOL[e.pool] : '') }, { key: 'createdAt', label: 'Date', render: e => day(e.createdAt) },
      { key: 'amount', label: 'Montant', right: true, num: true, render: e => { const m = e.lines.find((x: any) => x.account.startsWith('merchant:') && x.account.endsWith('available')) ?? e.lines.find((x: any) => x.account.startsWith('merchant:')); return m ? <span style={{ color: m.dir === 'credit' ? 'var(--ok)' : 'var(--ink)' }}>{m.dir === 'credit' ? '+' : '−'}{usd(m.amount)}</span> : '—'; } }]} /></div>;
}
