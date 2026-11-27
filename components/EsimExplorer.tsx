'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Globe, Search, X } from 'lucide-react';
import { useAuthUser } from '@/lib/client';
import { norm, REGIONS } from '@/lib/esim/format';
import { Flag, useDebounced, usd } from '@/components/EsimBits';
// Explorateur public des destinations eSIM : recherche, filtre par région, prix « à partir de » (prix de vente réels), pagination « Afficher plus ».
type D = { code: string; name: string; region: string | null; from: string; plans: number; maxGb: string; daily?: boolean };
type G = { name: string; scope: 'regional' | 'global'; from: string; plans: number; countries: number };
const STEP = 24;
export default function EsimExplorer() {
  const [d, setD] = useState<{ enabled: boolean; destinations: D[]; groups: G[] } | null>(null), [bad, setBad] = useState(false), [q, setQ] = useState(''), [reg, setReg] = useState(''), [n, setN] = useState(STEP), dq = useDebounced(q, 200), { user } = useAuthUser();
  useEffect(() => { fetch('/api/esim/public').then(r => r.ok ? r.json() : Promise.reject()).then(setD).catch(() => setBad(true)); }, []);
  useEffect(() => setN(STEP), [dq, reg]);
  const nq = norm(dq), dest = useMemo(() => (d?.destinations ?? []).filter(x => (!reg || reg === 'groups' || x.region === reg) && (!nq || norm(x.name).includes(nq))), [d, reg, nq]);
  const groups = useMemo(() => (d?.groups ?? []).filter(x => (!reg || reg === 'groups') && (!nq || norm(x.name).includes(nq))), [d, reg, nq]);
  if (bad || (d && (!d.enabled || !d.destinations.length))) return <div className="card" style={{ textAlign: 'center' }}><Globe size={28} aria-hidden /><h3 style={{ margin: '10px 0 6px' }}>Les destinations arrivent bientôt</h3><p className="mut" style={{ margin: 0 }}>Créez votre compte pour être prévenu dès l’ouverture des eSIM.</p></div>;
  const href = (name?: string) => user ? `/dashboard/esim${name ? `?q=${encodeURIComponent(name)}` : ''}` : '/register';
  const shown = reg === 'groups' ? [] : dest.slice(0, n);
  return <div className="stack" style={{ gap: 20 }}>
    <div className="es-xbar"><label className="pc-search"><Search size={18} aria-hidden /><input type="search" placeholder="Rechercher une destination : Japon, France, Turquie…" aria-label="Rechercher une destination" value={q} onChange={e => setQ(e.target.value)} /></label>
      <div className="es-chips" role="group" aria-label="Région">{[['', 'Toutes'], ...REGIONS, ['groups', 'Régional et mondial']].map(([k, l]) => <button key={k} type="button" className={'chip' + (reg === k ? ' on' : '')} aria-pressed={reg === k} onClick={() => setReg(k)}>{l}</button>)}</div></div>
    {!d ? <div className="es-dg">{Array.from({ length: 8 }, (_, i) => <div key={i} className="skel" style={{ height: 96, borderRadius: 14 }} />)}</div>
      : <>{(!shown.length && !groups.length) && <div className="empty"><b>Aucune destination trouvée</b><div>Essayez un autre nom ou une autre région.</div>{(q || reg) && <button className="btn sm" style={{ marginTop: 12 }} onClick={() => { setQ(''); setReg(''); }}><X size={14} aria-hidden /> Réinitialiser</button>}</div>}
        {shown.length > 0 && <div className="es-dg">{shown.map(x => <Link key={x.code} href={href(x.name)} className="es-dc"><Flag code={x.code} size={44} /><span className="es-dt"><b>{x.name}</b><small>{x.plans} forfait{x.plans > 1 ? 's' : ''} · jusqu’à {x.maxGb}{x.daily ? ' · illimité/jour' : ''}</small></span><span className="es-dp"><small>dès</small><b>{usd(x.from)}</b></span></Link>)}</div>}
        {dest.length > n && reg !== 'groups' && <div style={{ textAlign: 'center' }}><button className="btn" onClick={() => setN(n + STEP)}>Afficher plus de destinations ({dest.length - n})</button></div>}
        {groups.length > 0 && <><h3 className="es-h">Forfaits régionaux et mondiaux</h3><div className="es-dg">{groups.map(x => <Link key={x.scope + x.name} href={href()} className="es-dc"><Flag size={44} /><span className="es-dt"><b>{x.name}</b><small>{x.countries} pays · {x.plans} forfait{x.plans > 1 ? 's' : ''}</small></span><span className="es-dp"><small>dès</small><b>{usd(x.from)}</b></span></Link>)}</div></>}
        <p className="mut" style={{ margin: 0, textAlign: 'center', fontSize: 13 }}>Prix en dollars US, affichés avant tout achat. Le forfait exact (données, validité) se choisit dans votre tableau de bord.</p></>}
  </div>;
}
