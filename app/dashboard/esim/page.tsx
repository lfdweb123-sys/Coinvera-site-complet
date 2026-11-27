'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, Clock, Cpu, Download, Globe, Map as MapIcon, RefreshCw, Search, ShoppingBag, SlidersHorizontal, Smartphone, Wallet, X, Zap } from 'lucide-react';
import QRCode from 'qrcode';
import { api, msg, useData } from '@/lib/client';
import { day, Empty, PageHead, Stat } from '@/components/Bits';
import { CopyRow } from '@/components/CopyBtn';
import { Err, Modal } from '@/components/Wizard';
import { Flag, useDebounced, usd } from '@/components/EsimBits';
import { gbLabel, REGIONS, STATES } from '@/lib/esim/format';
// eSIM de voyage (eSIM Access), payées uniquement avec le solde disponible. Les prix viennent du serveur (prix prestataire + marge) et sont revérifiés à l'achat.
const units = (s: string) => Math.round(Number(s) * 1e6);   // total exact en unités 1e-6 USD, envoyé pour refuser tout achat si le prix a augmenté entre-temps
const newRef = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random().toString(16).slice(2)}`).replace(/-/g, '').slice(0, 32);
const Sel = ({ icon: I, label, value, onChange, children }: { icon: any; label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) => <label className="pc-sel"><I size={18} aria-hidden /><select aria-label={label} value={value} onChange={e => onChange(e.target.value)}>{children}</select><ChevronDown size={16} aria-hidden /></label>;
const Pill = ({ s }: { s: string }) => { const u = STATES[s] ?? { label: s, cls: '' as const }; return <span className={'badge ' + u.cls}>{u.label}</span>; };
const Pager = ({ page, size, total, onPage }: { page: number; size: number; total: number; onPage: (p: number) => void }) => { const pages = Math.max(1, Math.ceil(total / size)); return <div className="pc-foot es-pg"><span>{total} résultat{total > 1 ? 's' : ''} · page {page}/{pages}</span><span style={{ display: 'flex', gap: 6 }}><button className="btn sm" aria-label="Page précédente" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={16} /></button><button className="btn sm" aria-label="Page suivante" disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronRight size={16} /></button></span></div>; };
const Dest = ({ p }: { p: { title: string; locations: { code: string; name: string }[]; locationCount: number; scope: string } }) => <div className="pc-who"><Flag code={p.scope === 'country' ? p.locations[0]?.code : null} /><span><b>{p.title}</b><small>{p.scope === 'country' ? 'Pays' : `${p.locationCount} pays · ${p.scope === 'global' ? 'Mondial' : 'Régional'}`}</small></span></div>;

function BuyModal({ plan, avail, onClose, onDone, topupOf }: { plan: any; avail: number; onClose: () => void; onDone: (o: any) => void; topupOf?: string }) {
  const [e, setE] = useState(''), [busy, setBusy] = useState(false), [pref, setPref] = useState(newRef), [days, setDays] = useState('7'), [q, setQ] = useState<any>(null), [qe, setQe] = useState(''), dd = useDebounced(days, 400);
  const n = Number(days), daysOk = Number.isInteger(n) && n >= 1 && n <= 365;
  useEffect(() => {   // forfait par jour : le prix (remise de palier comprise) est calculé par le serveur pour la durée choisie
    if (!plan.daily || !(Number.isInteger(Number(dd)) && Number(dd) >= 1 && Number(dd) <= 365)) return; let stop = false; setQ(null); setQe('');
    api(`/api/esim/quote?slug=${encodeURIComponent(plan.id)}&days=${dd}${topupOf ? `&order=${encodeURIComponent(topupOf)}` : ''}`).then(r => !stop && setQ(r)).catch(x => !stop && setQe(msg(x)));
    return () => { stop = true; };
  }, [dd, plan.id, plan.daily, topupOf]);
  const ready = !plan.daily || (!!q && q.days === n && !qe), total = plan.daily ? q?.price : plan.price, enough = ready && avail >= Number(total), disc = q && q.ratio < 1 ? Math.round((1 - q.ratio) * 100) : 0;
  const buy = async () => { setE(''); setBusy(true); try { const o = await api(topupOf ? `/api/esim/orders/${topupOf}/topup` : '/api/esim/buy', { method: 'POST', body: JSON.stringify({ ref: pref, slug: plan.id, days: plan.daily ? n : undefined, expected: units(total) }) }); onDone(o); } catch (x) { setE(msg(x)); setPref(newRef()); setBusy(false); } };   // après une erreur, nouvelle référence : la commande refusée n'est jamais rejouée
  return <Modal title={topupOf ? 'Recharger cette eSIM' : 'Acheter cette eSIM'} size="md" onClose={busy ? () => {} : onClose}>
    <div className="stack" style={{ gap: 16 }}><Dest p={plan} />
      {plan.daily && <label className="stack" style={{ gap: 6 }}><b>Nombre de jours</b><input className="in" type="number" min={1} max={365} step={1} inputMode="numeric" value={days} onChange={e => setDays(e.target.value)} aria-invalid={!daysOk} /><span className="mut" style={{ fontSize: 13 }}>De 1 à 365 jours. Plus la durée est longue, plus la remise est forte.</span></label>}
      <div className="kv"><div>Données <b>{plan.gb}</b>{plan.daily && plan.fup ? <span className="mut"> (puis {plan.fup})</span> : null}</div><div>Validité <b>{plan.daily ? (daysOk ? `${n} jour${n > 1 ? 's' : ''}` : '—') : plan.daysLabel}</b></div>{plan.speed && <div>Réseau <b>{plan.speed}</b></div>}{plan.networks.length > 0 && <div>Opérateurs <b>{plan.networks.join(', ')}</b></div>}{!topupOf && <div>Démarrage <b>{plan.activeType === 2 ? 'À la première connexion' : 'À l’installation'}</b></div>}
        {disc > 0 && <div>Remise de durée <b>−{disc} %</b></div>}<div className="tot">Total à payer <b>{ready ? usd(total) : daysOk ? 'Calcul…' : '—'}</b></div><div className="mut">Solde disponible : {usd(avail)}</div></div>
      {ready && !enough && <p className="err" role="alert">Solde disponible insuffisant. <Link href="/dashboard/balances">Alimenter mon solde</Link></p>}<Err m={e || qe} />
      <p className="mut" style={{ margin: 0, fontSize: 13 }}>{topupOf ? 'Débité de votre solde disponible, uniquement à la confirmation. Une recharge ne peut pas être annulée.' : 'Débité de votre solde disponible, uniquement à l’achat. Tant que l’eSIM n’est pas installée, vous pouvez l’annuler et être remboursé intégralement.'}</p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}><button className="btn" disabled={busy} onClick={onClose}>Fermer</button><button className="btn p" disabled={busy || !enough || !ready} onClick={buy}>{busy ? 'En cours…' : ready ? `Payer ${usd(total)}` : 'Payer'}</button></div></div></Modal>;
}
function TopupPicker({ order, avail, onClose, onDone }: { order: any; avail: number; onClose: () => void; onDone: (o: any) => void }) {
  const h = useData(`/api/esim/orders/${order.id}/topups`), [pick, setPick] = useState<any>(null), items: any[] = h.data?.items ?? [];
  if (pick) return <BuyModal plan={pick} avail={avail} topupOf={order.id} onClose={() => setPick(null)} onDone={onDone} />;
  return <Modal title="Recharger cette eSIM" size="md" onClose={onClose}><div className="stack" style={{ gap: 12 }}><p className="mut" style={{ margin: 0 }}>Ajoute des données et de la validité à votre eSIM « {order.title} », sans réinstallation.</p>
    {h.error && !h.data ? <Err m={h.error} /> : !h.data ? <div className="skel" style={{ height: 60 }} /> : !items.length ? <Empty title="Aucune recharge disponible" hint="Cette eSIM ne peut pas être rechargée pour le moment." />
      : items.map(p => <div key={p.id} className="es-opt"><div><b>{p.gb}</b><small className="mut"> · {p.daily ? 'durée au choix' : p.daysLabel}</small></div><div className="es-optp"><b className="es-price">{usd(p.price)}{p.daily ? <small>/jour</small> : null}</b><button className="btn p sm" onClick={() => setPick(p)}>Choisir</button></div></div>)}
    <div style={{ textAlign: 'right' }}><button className="btn" onClick={onClose}>Fermer</button></div></div></Modal>;
}

function Shop({ avail, onBought, initialQ }: { avail: number; onBought: (o: any) => void; initialQ: string }) {
  const [q, setQ] = useState(initialQ), [type, setType] = useState(''), [scope, setScope] = useState('all'), [region, setRegion] = useState(''), [data, setData] = useState(''), [days, setDays] = useState(''), [sort, setSort] = useState(''), [page, setPage] = useState(1);
  const [res, setRes] = useState<any>(null), [err, setErr] = useState(''), [loading, setLoading] = useState(true), [buy, setBuy] = useState<any>(null), dq = useDebounced(q);
  useEffect(() => setQ(initialQ), [initialQ]);
  useEffect(() => setPage(1), [dq, type, scope, region, data, days, sort]);
  useEffect(() => {
    let stop = false; setLoading(true); const p = new URLSearchParams({ page: String(page), size: '10' }); for (const [k, v] of Object.entries({ q: dq, type, scope: scope === 'all' ? '' : scope, region, data, days, sort })) if (v) p.set(k, v);
    api('/api/esim/packages?' + p).then(r => { if (!stop) { setRes(r); setErr(''); } }).catch(x => { if (!stop) setErr(msg(x)); }).finally(() => { if (!stop) setLoading(false); });
    return () => { stop = true; };
  }, [dq, type, scope, region, data, days, sort, page]);
  const active = !!(q || type || scope !== 'all' || region || data || days || sort), reset = () => { setQ(''); setType(''); setScope('all'); setRegion(''); setData(''); setDays(''); setSort(''); };
  const items: any[] = res?.items ?? [];
  return <section className="pc-box" aria-label="Forfaits eSIM">
    <div className="es-fb"><label className="pc-search"><Search size={18} aria-hidden /><input type="search" placeholder="Rechercher une destination (Japon, France, Turquie…)" aria-label="Rechercher une destination" value={q} onChange={e => setQ(e.target.value)} /></label>
      <div className="es-chips" role="group" aria-label="Formule"><button type="button" className={'chip' + (!type ? ' on' : '')} aria-pressed={!type} onClick={() => setType('')}>Toutes formules</button><button type="button" className={'chip' + (type === 'fixed' ? ' on' : '')} aria-pressed={type === 'fixed'} onClick={() => setType('fixed')}>Volume total</button><button type="button" className={'chip' + (type === 'daily' ? ' on' : '')} aria-pressed={type === 'daily'} onClick={() => setType('daily')}>Par jour (illimité)</button></div>
      <div className="es-chips" role="group" aria-label="Type de forfait">{([['all', 'Tous'], ['country', 'Un pays'], ['regional', 'Régional'], ['global', 'Mondial']] as const).map(([k, l]) => <button key={k} type="button" className={'chip' + (scope === k ? ' on' : '')} aria-pressed={scope === k} onClick={() => setScope(k)}>{l}</button>)}</div>
      <div className="es-sels"><Sel icon={MapIcon} label="Région" value={region} onChange={setRegion}><option value="">Toutes les régions</option>{REGIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Sel>
        <Sel icon={Zap} label="Volume de données" value={data} onChange={setData}><option value="">Tous volumes</option><option value="le1">1 Go et moins</option><option value="le3">2 à 3 Go</option><option value="le5">4 à 5 Go</option><option value="le10">6 à 10 Go</option><option value="gt10">Plus de 10 Go</option></Sel>
        <Sel icon={Calendar} label="Validité" value={days} onChange={setDays}><option value="">Toutes durées</option><option value="le7">7 jours et moins</option><option value="le15">8 à 15 jours</option><option value="le30">16 à 30 jours</option><option value="gt30">Plus de 30 jours</option></Sel>
        <Sel icon={SlidersHorizontal} label="Tri" value={sort} onChange={setSort}><option value="">Pertinence</option><option value="price_asc">Prix croissant</option><option value="price_desc">Prix décroissant</option><option value="per_gb">Meilleur prix par Go</option><option value="data_desc">Plus de données</option><option value="days_desc">Plus longue validité</option></Sel></div>
      <div className="es-meta"><span className="pc-count">{res ? `${res.total} forfait${res.total > 1 ? 's' : ''}` : 'Chargement…'}</span>{active && <button className="btn sm" onClick={reset}><X size={14} aria-hidden /> Réinitialiser</button>}</div></div>
    {err ? <div style={{ padding: 20 }}><Err m={err} /></div> : !res ? <div style={{ padding: 20, display: 'grid', gap: 14 }}>{[0, 1, 2, 3].map(i => <div key={i} className="skel" style={{ height: 40, width: `${96 - i * 8}%` }} />)}</div>
      : !items.length ? <Empty title="Aucun forfait trouvé" hint="Essayez une autre destination ou retirez un filtre." />
      : <div className={'pc-scroll' + (loading ? ' es-busy' : '')}><table className="pc-t es-t"><thead><tr><th>Destination</th><th>Données</th><th>Validité</th><th>Réseau</th><th>Prix</th><th><span className="sr">Action</span></th></tr></thead>
        <tbody>{items.map(p => <tr key={p.id}><td data-label="Destination"><Dest p={p} /></td><td data-label="Données"><b className="es-gb">{p.gb}</b>{p.daily && p.fup ? <small className="mut"> puis {p.fup}</small> : null}</td><td data-label="Validité">{p.daysLabel}</td><td data-label="Réseau">{p.speed || '—'}{p.networks[0] ? <small className="mut"> · {p.networks[0]}</small> : null}</td><td data-label="Prix">{p.daily ? <small className="mut">dès </small> : null}<b className="es-price">{usd(p.price)}</b>{p.daily ? <small className="mut">/jour</small> : null}</td>
          <td><button className="btn p sm" onClick={() => setBuy(p)}><ShoppingBag size={15} aria-hidden /> Acheter</button></td></tr>)}</tbody></table></div>}
    {res && res.total > 0 && <Pager page={res.page} size={res.size} total={res.total} onPage={setPage} />}
    {buy && <BuyModal plan={buy} avail={avail} onClose={() => setBuy(null)} onDone={o => { setBuy(null); onBought(o); }} />}</section>;
}

function Qr({ text }: { text: string }) {
  const [u, setU] = useState('');
  useEffect(() => { let stop = false; QRCode.toDataURL(text, { margin: 1, width: 280, errorCorrectionLevel: 'M' }).then(x => !stop && setU(x)).catch(() => {}); return () => { stop = true; }; }, [text]);   // généré ici : le code d'activation ne part chez aucun service tiers
  return <div className="es-qr">{u ? <img src={u} alt="QR code d’installation de l’eSIM" width={220} height={220} /> : <div className="skel" style={{ width: 220, height: 220 }} />}</div>;
}
function Detail({ first, avail, onClose, onChange }: { first: any; avail: number; onClose: () => void; onChange: () => void }) {
  const [o, setO] = useState(first), [e, setE] = useState(''), [busy, setBusy] = useState(false), [sure, setSure] = useState(false), [top, setTop] = useState(false), [done, setDone] = useState(false), t = useRef<any>(null);
  useEffect(() => { let stop = false; const tick = async () => { try { const r = await api(`/api/esim/orders/${first.id}`); if (stop) return; setO((p: any) => ({ ...p, ...r })); if (r.state !== o.state) onChange(); } catch { /* on réessaie */ } if (!stop) t.current = setTimeout(tick, o.state === 'preparing' ? 3000 : 20000); };
    t.current = setTimeout(tick, o.state === 'preparing' ? 1500 : 0); return () => { stop = true; clearTimeout(t.current); }; }, [first.id, o.state]); // eslint-disable-line react-hooks/exhaustive-deps
  const cancel = async () => { setE(''); setBusy(true); try { setO(await api(`/api/esim/orders/${o.id}/cancel`, { method: 'POST' })); setSure(false); onChange(); } catch (x) { setE(msg(x)); } setBusy(false); };
  const u = o.usage, pct = u && u.total ? Math.min(100, Math.round(u.used / u.total * 100)) : 0, ready = !!o.ac && !o.refunded && !['expired', 'revoked', 'refunded'].includes(o.state);
  return <Modal title={`eSIM · ${o.title}`} onClose={onClose}><div className="stack" style={{ gap: 16 }}>
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}><Dest p={o} /><Pill s={o.state} /><span className="mut" style={{ marginLeft: 'auto' }}>{o.gb} · {o.daily ? `${o.days} jour${o.days > 1 ? 's' : ''}` : o.daysLabel} · {usd(o.total)}{o.topups > 0 ? ` · ${o.topups} recharge${o.topups > 1 ? 's' : ''}` : ''}</span></div>
    {o.state === 'preparing' && <div className="note" role="status"><RefreshCw size={14} className="es-spin" aria-hidden /> Préparation de votre eSIM… elle apparaît dans quelques secondes (actualisation automatique).</div>}
    {o.state === 'review' && <p className="mut" role="status">Vérification en cours : le résultat de votre achat est en cours de confirmation. Vos fonds sont protégés : ils seront débités définitivement ou remis sur votre solde automatiquement.</p>}
    {o.state === 'failed' && <><Err m={msg({ message: o.error ?? 'error' })} /><p className="mut">Les fonds ont été remis sur votre solde.</p></>}
    {o.refunded && <p className="okm" role="status">Annulation acceptée : {usd(o.total)} ont été remis sur votre solde.</p>}
    {ready && <div className="es-inst"><div className="es-qrcol"><Qr text={o.ac} /><p className="mut" style={{ margin: 0, textAlign: 'center', fontSize: 13 }}>Scannez ce QR code depuis <b>Réglages → Données cellulaires / Mobile → Ajouter une eSIM</b>.</p>
        <a className="btn p full" href={`https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=${o.ac}`} target="_blank" rel="noreferrer"><Smartphone size={16} aria-hidden /> Installer sur iPhone (iOS 17.4+)</a></div>
      <div className="stack" style={{ gap: 10 }}><p className="mut" style={{ margin: 0 }}>Installation manuelle (si le scan est impossible) :</p>
        {o.smdp && <CopyRow label="Adresse SM-DP+" value={o.smdp} mono />}{o.matchingId && <CopyRow label="Code d’activation" value={o.matchingId} mono />}<CopyRow label="Code complet (LPA)" value={o.ac} mono />{o.iccid && <CopyRow label="ICCID" value={o.iccid} mono />}</div></div>}
    {u && u.total > 0 && !o.refunded && o.state !== 'preparing' && <div className="es-use"><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}><b>Consommation</b><span className="mut">{gbLabel(u.used)} / {gbLabel(u.total)} ({pct} %)</span></div><div className="es-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Données consommées"><i style={{ width: pct + '%' }} /></div>
      <div className="kv" style={{ marginTop: 10 }}><div>Expire le <b>{day(o.expiresAt)}</b></div>{o.apn && <div>APN <b>{o.apn}</b></div>}</div><p className="mut" style={{ margin: '8px 0 0', fontSize: 13 }}><Clock size={13} style={{ verticalAlign: -2 }} aria-hidden /> La consommation est mise à jour avec 2 à 3 heures de décalage.</p></div>}
    {ready && <details className="faq"><summary>Comment installer mon eSIM ?</summary><p><b>iPhone</b> : Réglages → Données cellulaires → Ajouter une eSIM → Utiliser un QR code. <b>Android</b> : Paramètres → Réseau et Internet → SIM → Ajouter une eSIM. Activez ensuite la ligne eSIM et l’itinérance des données à destination. Votre téléphone doit être compatible eSIM et débloqué.</p></details>}
    {done && <p className="okm" role="status">Recharge effectuée : les données et la validité de votre eSIM ont été mises à jour.</p>}
    {o.canTopup && <div><button className="btn p" onClick={() => setTop(true)}><Zap size={15} aria-hidden /> Recharger cette eSIM</button></div>}
    <Err m={e} />
    {o.canCancel && (sure ? <div className="note"><p style={{ margin: '0 0 10px' }}>Annuler cette eSIM ? Elle sera supprimée et <b>{usd(o.total)}</b> seront remis sur votre solde. Possible uniquement tant qu’elle n’est pas installée.</p><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><button className="btn d" disabled={busy} onClick={cancel}>{busy ? 'Annulation…' : 'Oui, annuler et être remboursé'}</button><button className="btn" disabled={busy} onClick={() => setSure(false)}>Non, la garder</button></div></div>
      : <div><button className="btn" onClick={() => setSure(true)}><X size={15} aria-hidden /> Annuler et être remboursé</button></div>)}
  </div>{top && <TopupPicker order={o} avail={avail} onClose={() => setTop(false)} onDone={r => { setTop(false); setDone(true); setO((p: any) => ({ ...p, ...r })); onChange(); }} />}</Modal>;
}

function Mine({ rk, onOpen }: { rk: number; onOpen: (o: any) => void }) {
  const [q, setQ] = useState(''), [st, setSt] = useState(''), [page, setPage] = useState(1), dq = useDebounced(q);
  useEffect(() => setPage(1), [dq, st]);
  const h = useData(`/api/esim/orders?page=${page}&size=10&q=${encodeURIComponent(dq)}&state=${st}`), rows: any[] = h.data?.items ?? [];
  useEffect(() => { if (rk) h.reload(); }, [rk]); // eslint-disable-line react-hooks/exhaustive-deps
  return <section className="pc-box" aria-label="Mes eSIM"><div className="pc-bar"><span className="pc-count">{h.data ? `${h.data.total} eSIM` : 'Chargement…'}</span>
    <div className="pc-tools"><label className="pc-search"><Search size={18} aria-hidden /><input type="search" placeholder="Rechercher (destination, ICCID)" aria-label="Rechercher une eSIM" value={q} onChange={e => setQ(e.target.value)} /></label>
      <Sel icon={SlidersHorizontal} label="Filtrer par statut" value={st} onChange={setSt}><option value="">Tous les statuts</option>{Object.entries(STATES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Sel></div></div>
    {h.error && !h.data ? <div style={{ padding: 20 }}><Err m={h.error} /></div> : !h.data ? <div style={{ padding: 20, display: 'grid', gap: 14 }}>{[0, 1, 2].map(i => <div key={i} className="skel" style={{ height: 40, width: `${96 - i * 8}%` }} />)}</div>
      : !rows.length ? <Empty title={q || st ? 'Aucune eSIM trouvée' : 'Aucune eSIM pour le moment'} hint={q || st ? 'Modifiez la recherche ou le filtre.' : 'Achetez votre première eSIM depuis l’onglet Boutique.'} />
      : <div className={'pc-scroll' + (h.loading ? ' es-busy' : '')}><table className="pc-t es-t"><thead><tr><th>eSIM</th><th>Statut</th><th>Consommation</th><th>Expire le</th><th>ICCID</th><th>Total</th><th><span className="sr">Action</span></th></tr></thead>
        <tbody>{rows.map(o => { const pct = o.usage?.total ? Math.min(100, Math.round(o.usage.used / o.usage.total * 100)) : 0; return <tr key={o.id} tabIndex={0} onClick={() => onOpen(o)} onKeyDown={e => e.key === 'Enter' && onOpen(o)}>
          <td data-label="eSIM"><div className="pc-who"><Flag code={o.scope === 'country' ? o.locations[0]?.code : null} /><span><b>{o.title}</b><small>{o.gb} · {o.daily ? `${o.days} j` : o.daysLabel}</small></span></div></td><td data-label="Statut"><Pill s={o.state} /></td>
          <td data-label="Consommation">{o.usage?.total > 0 && ['active', 'installed', 'depleted', 'ready'].includes(o.state) ? <div className="es-mini"><div className="es-bar"><i style={{ width: pct + '%' }} /></div><small className="mut">{pct} %</small></div> : '—'}</td>
          <td data-label="Expire le">{o.expiresAt ? day(o.expiresAt) : '—'}</td><td data-label="ICCID"><span className="mono">{o.iccid ? '…' + o.iccid.slice(-8) : '—'}</span></td><td data-label="Total"><b>{usd(o.total)}</b></td>
          <td><button className="btn sm" onClick={e => { e.stopPropagation(); onOpen(o); }}>Ouvrir</button></td></tr>; })}</tbody></table></div>}
    {h.data && h.data.total > 0 && <Pager page={page} size={10} total={h.data.total} onPage={setPage} />}</section>;
}

export default function Esim() {
  const [tab, setTab] = useState<'shop' | 'mine'>('shop'), [open, setOpen] = useState<any>(null), [q0, setQ0] = useState(''), [rl, setRl] = useState(0);
  const bal = useData('/api/balance'), mine = useData('/api/esim/orders?page=1&size=5'), avail = Number(bal.data?.available ?? 0);
  useEffect(() => { const q = new URLSearchParams(window.location.search).get('q'); if (q) setQ0(q.slice(0, 60)); }, []);
  const refresh = useCallback(() => { bal.reload(); mine.reload(); setRl(n => n + 1); }, [bal.reload, mine.reload]); // eslint-disable-line react-hooks/exhaustive-deps
  const bought = (o: any) => { setTab('mine'); setOpen(o); refresh(); };
  if (mine.error === msg({ message: 'esim_disabled' })) return <div className="stack"><PageHead title="eSIM" sub="eSIM de voyage pour rester connecté à l’étranger." /><Empty title="Service bientôt disponible" hint="Les eSIM ne sont pas encore activées sur ce compte." /></div>;
  const st = mine.data?.stats;
  return <div className="stack"><PageHead title="eSIM" sub="Forfaits data pour voyager sans carte SIM physique, payés avec votre solde disponible."><Link href="/esim" className="btn"><Globe size={16} aria-hidden /> Destinations et aide</Link></PageHead>
    <div className="g4"><Stat icon={Wallet} label="Solde disponible" value={usd(bal.data?.available)} /><Stat icon={Cpu} label="eSIM utilisables" value={st ? st.active : '—'} /><Stat icon={Download} label="eSIM achetées" value={st ? st.total : '—'} /><Stat icon={ShoppingBag} label="Total dépensé" value={st ? usd(st.spent) : '—'} /></div>
    <div className="tabs" role="tablist">{([['shop', 'Boutique', ShoppingBag], ['mine', 'Mes eSIM', Cpu]] as const).map(([k, l, I]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><I size={15} style={{ verticalAlign: -2, marginRight: 6 }} />{l}</button>)}</div>
    {tab === 'shop' ? <Shop avail={avail} onBought={bought} initialQ={q0} /> : <Mine rk={rl} onOpen={setOpen} />}
    {open && <Detail key={open.id} first={open} avail={avail} onClose={() => setOpen(null)} onChange={refresh} />}</div>;
}
