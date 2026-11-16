'use client';
import { useState } from 'react';
import { Activity, AlertTriangle, ArrowUpFromLine, Banknote, CheckCircle2, Clock, LifeBuoy, Percent, Users } from 'lucide-react';
import { api, useData } from '@/lib/client';
import { PageHead, Stat, usd } from '@/components/Bits';
export default function Admin() {
  const { data: d, loading, error } = useData('/api/admin/stats'); const [rec, setRec] = useState<any>(null);
  const v = (x: any) => loading ? '…' : x;
  return <div className="stack"><PageHead title="Vue d’ensemble" sub="Santé de la plateforme.">{error && <span className="err">{error}</span>}</PageHead>
    <div className="grid"><Stat icon={Users} label="Marchands" value={v(d?.merchants)} /><Stat icon={Activity} label="Marchands actifs" value={v(d?.active)} /><Stat icon={CheckCircle2} label="Paiements confirmés" value={v(d?.confirmedPayments)} /><Stat icon={Banknote} label="Volume traité" value={v(usd(d?.volume))} />
      <Stat icon={Percent} label="Commissions générées" value={v(usd(d?.feesGenerated))} /><Stat icon={Clock} label="Paiements en attente" value={v(d?.pendingPayments)} /><Stat icon={ArrowUpFromLine} label="Retraits en cours" value={v(d?.pendingWithdrawals)} /><Stat icon={AlertTriangle} label="Retraits à vérifier" value={v(d?.withdrawalsToReview)} /><Stat icon={LifeBuoy} label="Nouveaux tickets" value={v(d?.newTickets)} /></div>
    <div className="card"><h3>Réconciliation comptable</h3><p className="mut" style={{ margin: '6px 0 14px' }}>Compare la somme des soldes marchands au registre immuable.</p><button className="btn p" onClick={async () => setRec(await api('/api/admin/reconcile'))}>Lancer le contrôle</button>
      {rec && <p className={rec.consistent ? 'okm' : 'err'} style={{ marginTop: 12 }}>{rec.consistent ? 'Cohérent' : 'ÉCART DÉTECTÉ'} — soldes {rec.balances} · registre {rec.ledger}</p>}</div></div>;
}
