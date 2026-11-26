'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Copy, Eye, EyeOff, Plus, Settings2, Snowflake, Flame } from 'lucide-react';
import { api, msg, useData } from '@/lib/client';
import { Empty, PageHead } from '@/components/Bits';
import ProCard from '@/components/ProCard';
import { CardDrawer, StatusPill, money } from '@/components/ProCards';
import { Err } from '@/components/Wizard';

// Mes cartes : chaque carte achetée est affichée en carte, avec ses actions directes (afficher, recharger, geler, gérer).
// Numéro et code ne sont lus qu'à la demande, jamais stockés, et se masquent seuls après 1 minute.
const who = (c: any) => c.holderName || c.nameOnCard || '';
function Tile({ c, canTopup, onTopup, onManage, onChange }: { c: any; canTopup: boolean; onTopup: () => void; onManage: () => void; onChange: () => void }) {
  const [shown, setShown] = useState<any>(null), [busy, setBusy] = useState(false), [e, setE] = useState(''), [cp, setCp] = useState('');
  const act = (action: string) => api(`/api/scarab/cards/${c.id}/action`, { method: 'POST', body: JSON.stringify({ action }) });
  const run = async (f: () => Promise<any>) => { setE(''); setBusy(true); try { await f(); } catch (x) { setE(msg(x)); } setBusy(false); };
  useEffect(() => { if (!shown) return; const t = setTimeout(() => setShown(null), 60_000); return () => clearTimeout(t); }, [shown]);
  const det = shown?.type === 'details' ? shown : null, frozen = c.status === 'frozen', live = c.status === 'active' || frozen;
  const copy = (t: string, k: string) => { navigator.clipboard?.writeText(t).then(() => { setCp(k); setTimeout(() => setCp(''), 1500); }).catch(() => {}); };
  return <article className="mc-t" aria-label={`Carte ${who(c)} se terminant par ${c.last4 ?? ''}`}>
    <div className="mc-top"><StatusPill s={c.status} /><span className="mut mc-bal">Solde <b>{money(c.balance ?? 0)}</b></span></div>
    <ProCard product={c.productName} name={det?.name || who(c) || null} last4={c.last4} frozen={frozen} expiry={det ? det.expiry : c.expiry} pan={det?.pan ?? null} cvv={det?.cvv ?? null} />
    {det && <div className="mc-cp"><button type="button" className="btn sm" onClick={() => copy(String(det.pan ?? '').replace(/\D/g, ''), 'p')}>{cp === 'p' ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />} Numéro</button><button type="button" className="btn sm" onClick={() => copy(String(det.expiry ?? ''), 'e')}>{cp === 'e' ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />} Expiration</button><button type="button" className="btn sm" onClick={() => copy(String(det.cvv ?? ''), 'c')}>{cp === 'c' ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />} CVV</button></div>}
    <div className="mc-st"><div><span>Recharges ce mois-ci</span><b>{money(c.topupMonth ?? 0)}</b></div><div><span>Dépenses ce mois-ci</span><b>{c.spentMonth != null ? money(c.spentMonth) : '—'}</b></div></div>
    {live ? <div className="mc-act">
      {c.status === 'active' && (det ? <button type="button" className="btn" onClick={() => setShown(null)}><EyeOff size={16} aria-hidden /> Masquer</button> : <button type="button" className="btn p" disabled={busy} onClick={() => run(async () => setShown(await act('details')))}><Eye size={16} aria-hidden /> Afficher la carte</button>)}
      <button type="button" className="btn" disabled={!canTopup || frozen || busy} title={!canTopup ? 'Déposez du solde avant de recharger' : frozen ? 'Dégelez la carte pour la recharger' : undefined} onClick={onTopup}><Plus size={16} aria-hidden /> Recharger</button>
      <button type="button" className="btn soft" disabled={busy} onClick={() => run(async () => { await act(frozen ? 'unfreeze' : 'freeze'); onChange(); })}>{frozen ? <Flame size={16} aria-hidden /> : <Snowflake size={16} aria-hidden />} {frozen ? 'Dégeler' : 'Geler'}</button>
      <button type="button" className="btn soft" onClick={onManage}><Settings2 size={16} aria-hidden /> Gérer</button></div>
      : <p className="mut" role="status" style={{ margin: 0 }}>{c.status === 'pending' ? 'Carte en cours de création : disponible dans quelques instants.' : 'Cette carte n’est plus utilisable.'}</p>}
    <Err m={e} /></article>;
}
export default function MesCartes() {
  const d = useData('/api/scarab'), pr = useData('/api/scarab/products'), r = useRouter(); const [m, setM] = useState<any>(null); const reload = d.reload;
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) reload(); }, 30000); return () => clearInterval(t); }, [reload]);
  const close = useCallback(() => setM(null), []); const x = d.data, products = pr.data?.products ?? [], prod = (id: string) => products.find((p: any) => p.id === id);
  const spend = x ? Number(x.balance) + Number(x.credit ?? 0) : 0, can = (c: any) => spend >= Number(prod(c.productId)?.minRecharge ?? 5);
  if (d.error && !x) return <><PageHead title="Mes cartes" /><p className="err" role="alert">{d.error}</p></>;
  const cards: any[] = (x?.cards ?? []).filter((c: any) => c.status !== 'terminated' && c.status !== 'failed');
  return <>
    <PageHead title="Mes cartes" sub="Vos Virtuals cards pro : affichez, rechargez et gérez chaque carte directement."><Link href="/dashboard/carte-pro?new=1" className="btn p"><Plus size={16} aria-hidden /> Nouvelle carte</Link></PageHead>
    {!x ? <p className="mut" role="status">Chargement…</p> : !cards.length ? <Empty title="Aucune carte pour le moment" hint="Achetez votre première carte depuis Virtuals cards pro." />
      : <div className="mc-g">{cards.map(c => <Tile key={c.id} c={c} canTopup={can(c)} onTopup={() => r.push(`/dashboard/carte-pro?topup=${c.id}`)} onManage={() => setM(c)} onChange={reload} />)}</div>}
    {m && (() => { const fc = cards.find(k => k.id === m.id) ?? m; return <CardDrawer c={fc} billing={x?.billingAddress} canTopup={can(fc)} onClose={close} onChange={reload} onTopup={(k: any) => r.push(`/dashboard/carte-pro?topup=${k.id}`)} />; })()}
  </>;
}
