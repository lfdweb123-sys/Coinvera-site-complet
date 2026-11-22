'use client';
import Link from 'next/link';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Percent, Wallet, Lock, CreditCard, ShieldCheck, ArrowRight } from 'lucide-react';
import { useData } from '@/lib/client';
import { Badge, day, Empty, PageHead, Stat, usd } from '@/components/Bits';
import DataTable from '@/components/DataTable';
export default function Overview() {
  const b = useData('/api/balance'), t = useData('/api/transactions?size=100'), w = useData('/api/withdrawals?size=5');
  const tx: any[] = t.data?.items ?? [], wd: any[] = w.data?.items ?? [];
  const per: Record<string, number> = {}; tx.filter(x => x.status === 'confirmed').forEach(x => { const k = x.createdAt?.slice(0, 10); per[k] = (per[k] ?? 0) + Number(x.amount); });
  const chart = Object.entries(per).sort().map(([d, v]) => ({ d: d.slice(5), v })); const d = b.data;
  return <div className="stack"><PageHead title="Vue d’ensemble" sub="L’activité de votre compte en un coup d’œil."><Link className="btn" href="/dashboard/withdrawals">Retirer</Link><Link className="btn p" href="/dashboard/api">Clés API</Link></PageHead>
    <section className="cpro" aria-label="Mes cartes">
      <div className="cpro-i"><div className="cpro-t"><span className="cpro-ic"><CreditCard size={22} /></span><h3>Virtuals cards standard</h3></div>
        <p>Carte virtuelle Visa ou Mastercard rechargeable pour payer en ligne, sans compte bancaire.</p>
        <Link className="btn w" href="/dashboard/cards">Activer ma carte <ArrowRight size={16} /></Link></div>
      <div className="cpro-i pro"><div className="cpro-t"><span className="cpro-ic"><ShieldCheck size={22} /></span><h3>Virtuals cards pro</h3><span className="cpro-tag">Pro</span></div>
        <p>Carte virtuelle Visa vérifiée, avec des frais fixes affichés avant chaque paiement.</p>
        <Link className="btn w" href="/dashboard/carte-pro">J’active ma carte <ArrowRight size={16} /></Link></div></section>
    <div className="g6"><Stat icon={Wallet} label="Solde disponible" value={b.loading ? '…' : usd(d?.available)} /><Stat icon={Lock} label="Solde réservé" value={b.loading ? '…' : usd(d?.reserved)} /><Stat icon={ArrowDownToLine} label="Total reçu" value={b.loading ? '…' : usd(d?.totalReceived)} />
      <Stat icon={ArrowUpFromLine} label="Total retiré" value={b.loading ? '…' : usd(d?.totalWithdrawn)} /><Stat icon={Percent} label="Commissions payées" value={b.loading ? '…' : usd(d?.feesPaid)} /><Stat icon={ArrowLeftRight} label="Transactions" value={t.loading ? '…' : t.data?.total ?? 0} /></div>
    {!t.loading && tx.length === 0 ? <div className="card"><Empty title="Aucune transaction pour le moment" hint="Générez une clé API ou installez le plugin WooCommerce pour recevoir votre premier paiement."><Link className="btn p" href="/dashboard/api">Configurer l’API</Link></Empty></div> : <>
      <div className="card"><h3 style={{ marginBottom: 16 }}>Paiements confirmés par jour (USD)</h3><div style={{ height: 260 }}><ResponsiveContainer><AreaChart data={chart}><CartesianGrid stroke="#E5EAF2" vertical={false} /><XAxis dataKey="d" fontSize={12} tickLine={false} axisLine={false} /><YAxis fontSize={12} tickLine={false} axisLine={false} width={44} /><Tooltip /><Area dataKey="v" stroke="#2255E8" strokeWidth={2} fill="#EAF0FE" /></AreaChart></ResponsiveContainer></div></div>
      <div><h3 style={{ marginBottom: 12 }}>Dernières transactions</h3><DataTable loading={t.loading} rows={tx.slice(0, 5)} pageSize={5} empty="Aucune transaction" cols={[{ key: 'title', label: 'Transaction' }, { key: 'amount', label: 'Montant', num: true, render: r => usd(r.amount) }, { key: 'net', label: 'Net', num: true, render: r => usd(r.net) }, { key: 'createdAt', label: 'Date', render: r => day(r.createdAt) }, { key: 'status', label: 'Statut', render: r => <Badge s={r.status} /> }]} /></div></>}
    {wd.length > 0 && <div><h3 style={{ marginBottom: 12 }}>Derniers retraits</h3><DataTable rows={wd.slice(0, 5)} pageSize={5} empty="Aucun retrait" cols={[{ key: 'coin', label: 'Actif', render: r => `${r.coin} · ${r.chain}` }, { key: 'amountUnits', label: 'Montant', num: true, render: r => usd(r.amountUnits) }, { key: 'createdAt', label: 'Date', render: r => day(r.createdAt) }, { key: 'status', label: 'Statut', render: r => <Badge s={r.status} /> }]} /></div>}</div>;
}
