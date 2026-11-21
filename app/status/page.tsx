'use client';
import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { Header, Footer } from '@/components/Site';
import { SITE } from '@/lib/site';
import PageHero from '@/components/PageHero';
export default function Status() {
  const [d, setD] = useState<any>(null), [e, setE] = useState(false);
  useEffect(() => { const run = async () => { try { setD(await (await fetch('/api/status', { cache: 'no-store' })).json()); setE(false); } catch { setE(true); } }; run(); const t = setInterval(run, 30000); return () => clearInterval(t); }, []);
  const ok = d?.components?.every((c: any) => c.status === 'operational');
  return <><Header base={SITE} /><PageHero v={2} eyebrow="État des services" title={!d ? 'Vérification en cours…' : ok ? 'Tous les systèmes sont opérationnels' : 'Perturbation détectée'} sub="Disponibilité des services Coinvera, actualisée automatiquement toutes les 30 secondes." />
    <main className="sec"><div className="wrap" style={{ maxWidth: 860 }}><div className="card pad0">{e && <div className="srow"><span>Impossible de récupérer l’état des services.</span><span className="badge bad">Hors ligne</span></div>}
      {(d?.components ?? [{ name: 'Tableau de bord et API' }, { name: 'Paiements par carte' }, { name: 'Envoi des retraits' }]).map((c: any) => <div className="srow" key={c.name}><span style={{ display: 'flex', gap: 12, alignItems: 'center', fontWeight: 600 }}>{c.status === 'degraded' ? <AlertTriangle size={20} color="var(--warn)" /> : <CheckCircle2 size={20} color={c.status ? 'var(--ok)' : '#CBD5E1'} />}{c.name}</span>
        <span className={'badge ' + (c.status === 'operational' ? 'ok' : c.status ? 'warn' : '')}>{c.status === 'operational' ? 'Opérationnel' : c.status ? 'Dégradé' : '…'}</span></div>)}</div>
      {d && <p className="mut" style={{ marginTop: 14 }}>Dernière vérification : {new Date(d.updatedAt).toLocaleTimeString('fr-FR')}</p>}</div></main><Footer base={SITE} /></>;
}
