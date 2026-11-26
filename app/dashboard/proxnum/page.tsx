'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, MessageSquare, Phone, RefreshCw, Wallet, X } from 'lucide-react';
import { CopyRow } from '@/components/CopyBtn';
import { api, msg, useData } from '@/lib/client';
import { day, Empty, PageHead, Stat } from '@/components/Bits';
import DataTable from '@/components/DataTable';
import { Err } from '@/components/Wizard';
// Numéros virtuels ProxNum, payés uniquement avec le solde disponible. Les prix affichés viennent du serveur (prix prestataire + marge) et sont revérifiés à l'achat.
const money = (s: string | number | null | undefined) => s == null || s === '' || isNaN(Number(s)) ? '—' : Number(s).toLocaleString('fr-FR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 });
const units = (s: string) => Math.round(Number(s) * 1e6);   // total exact en unités 1e-6 USD, envoyé pour refuser tout achat si le prix a augmenté entre-temps
const newRef = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random().toString(16).slice(2)}`).replace(/-/g, '').slice(0, 32);
const ST: Record<string, string> = { reserved: 'En cours', review: 'Vérification', confirmed: 'Actif', failed: 'Échoué' };
const live = (o: any) => o.status === 'confirmed' && !o.refunded && (o.kind === 'rental' ? o.providerStatus !== 'expired' && o.providerStatus !== 'cancelled' : !o.code);
function useGet<T = any>(path: string | null) {
  const [d, setD] = useState<T | null>(null), [e, setE] = useState(''), [l, setL] = useState(false);
  useEffect(() => { if (!path) { setD(null); setE(''); return; } let stop = false; setL(true); setE(''); api(path).then(r => !stop && setD(r)).catch(x => !stop && (setE(msg(x)), setD(null))).finally(() => !stop && setL(false)); return () => { stop = true; }; }, [path]);
  return { d, e, l };
}
function Order({ first, onChange }: { first: any; onChange?: () => void }) {
  const [o, setO] = useState(first), [e, setE] = useState(''), [busy, setBusy] = useState(false), [opts, setOpts] = useState<any[] | null>(null), [hours, setHours] = useState(0), [xref, setXref] = useState(newRef); const t = useRef<any>(null);
  useEffect(() => setO(first), [first.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { let stop = false; const tick = async () => { try { const r = await api(`/api/proxnum/orders/${o.id}`); if (stop) return; setO(r); if (!live(r)) { onChange?.(); return; } } catch { /* on réessaie */ } t.current = setTimeout(tick, o.kind === 'rental' ? 8000 : 5000); };
    if (live(o)) t.current = setTimeout(tick, 4000); return () => { stop = true; clearTimeout(t.current); }; }, [o.id, live(o)]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (path: string, body?: unknown) => { setE(''); setBusy(true); try { const r = await api(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }); setO(r); onChange?.(); return r; } catch (x) { setE(msg(x)); } finally { setBusy(false); } };
  const loadOpts = async () => { setE(''); try { const r = await api(`/api/proxnum/orders/${o.id}/extend-options`); setOpts(r.options); setHours(r.options[0]?.hours ?? 0); } catch (x) { setE(msg(x)); } };
  const rental = o.kind === 'rental', sel = opts?.find(x => x.hours === hours);
  return <div className="card stack" style={{ gap: 12 }}>
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><b>{o.serviceName} · {o.countryName}{rental && o.hours ? ` · ${o.hours} h` : ''}</b><span className={'badge ' + (o.refunded ? 'info' : o.status === 'confirmed' ? 'ok' : o.status === 'failed' ? 'bad' : 'warn')}>{o.refunded ? 'Remboursé' : (ST[o.status] ?? o.status)}</span><span className="mut" style={{ marginLeft: 'auto' }}>{money(o.total)}</span></div>
    {o.status === 'reserved' && <p className="mut" role="status">Achat en cours… votre numéro apparaît dans quelques instants.</p>}
    {o.status === 'review' && <p className="mut" role="status">Vérification en cours : le résultat de votre achat est en cours de confirmation. Vos fonds sont protégés : ils seront débités définitivement ou remis sur votre solde automatiquement.</p>}
    {o.status === 'failed' && <><Err m={msg({ message: o.error ?? 'error' })} /><p className="mut">Les fonds ont été remis sur votre solde.</p></>}
    {o.status === 'confirmed' && <>
      {o.phone && <CopyRow label="Numéro" value={o.phone} mono />}
      {o.refunded ? <p className="okm" role="status">Annulation acceptée : {money(o.total)} ont été remis sur votre solde.</p>
        : rental ? <>
          <div className="kv"><div>Expire le <b>{day(o.expiresAt)}</b></div>{o.cancel === 'pending' && <div className="mut">Annulation demandée : le remboursement arrive dès sa confirmation.</div>}</div>
          {o.messages.length ? <div className="stack" style={{ gap: 8 }}>{o.messages.map((m: any, i: number) => <div key={i} className="kv"><div><MessageSquare size={14} style={{ verticalAlign: -2 }} /> {m.sender || 'SMS'} <span className="mut">{day(m.date)}</span></div><div>{m.code ? <b style={{ fontSize: 20, letterSpacing: 1 }}>{m.code}</b> : null} <span className="mut">{m.text}</span></div></div>)}</div> : <p className="mut" role="status"><Clock size={14} style={{ verticalAlign: -2 }} /> En attente de SMS… (actualisation automatique)</p>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {o.canCancel && o.cancel !== 'pending' && <button className="btn" disabled={busy} onClick={() => act(`/api/proxnum/orders/${o.id}/cancel`)}><X size={15} /> Annuler et être remboursé</button>}
            {o.canExtend && o.providerStatus === 'active' && !opts && <button className="btn" disabled={busy} onClick={loadOpts}><RefreshCw size={15} /> Prolonger</button>}</div>
          {opts && <div className="stack" style={{ gap: 8 }}>{opts.length ? <><label htmlFor={'x' + o.id}>Durée de prolongation</label><select id={'x' + o.id} className="in" value={hours} onChange={x => setHours(Number(x.target.value))}>{opts.map(x => <option key={x.hours} value={x.hours}>{x.label} — {money(x.price)}</option>)}</select>
            <div style={{ display: 'flex', gap: 10 }}><button className="btn p" disabled={busy || !sel} onClick={async () => { const r = await act(`/api/proxnum/orders/${o.id}/extend`, { ref: xref, hours, expected: units(sel.price) }); if (r) { setXref(newRef()); setOpts(null); } }}>Prolonger pour {money(sel?.price)}</button><button className="btn" onClick={() => setOpts(null)}>Fermer</button></div>
            <p className="mut" style={{ margin: 0 }}>Une location prolongée ne peut plus être annulée.</p></> : <p className="mut">Aucune prolongation proposée pour ce numéro.</p>}</div>}</>
        : <>{o.code ? <div className="kv big"><div>Code reçu <b style={{ fontSize: 28, letterSpacing: 2 }}>{o.code}</b></div></div> : <p className="mut" role="status"><Clock size={14} style={{ verticalAlign: -2 }} /> En attente du SMS… (actualisation automatique)</p>}
          {o.code && <CopyRow label="Code" value={o.code} mono />}
          {!o.code && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><button className="btn" disabled={busy} onClick={() => act(`/api/proxnum/orders/${o.id}/resend`)}><RefreshCw size={15} /> Renvoyer le SMS</button><button className="btn" disabled={busy} onClick={() => act(`/api/proxnum/orders/${o.id}/cancel`)}><X size={15} /> Annuler et être remboursé</button></div>}</>}</>}
    <Err m={e} /></div>;
}
function Virtual({ avail, onOrder }: { avail: number; onOrder: (o: any) => void }) {
  const [country, setCountry] = useState(''), [service, setService] = useState(''), [token, setToken] = useState(''), [e, setE] = useState(''), [busy, setBusy] = useState(false), [pref, setPref] = useState(newRef);
  const cs = useGet<{ countries: any[] }>('/api/proxnum/virtual/countries'), ss = useGet<{ services: any[] }>(country ? `/api/proxnum/virtual/services?country=${country}` : null), q = useGet<any>(country && service ? `/api/proxnum/virtual/quote?service=${service}&country=${country}` : null);
  const opt = q.d?.options?.find((o: any) => o.token === token); const price: string | undefined = opt?.price ?? q.d?.price; const enough = price !== undefined && avail >= Number(price);
  return <div className="stack"><p className="mut" style={{ margin: 0 }}>Un numéro temporaire pour recevoir un seul SMS de vérification. Payé avec votre solde disponible ; si aucun SMS n’arrive, annulez pour être remboursé quand l’annulation est acceptée.</p>
    <label htmlFor="pc">Pays</label><select id="pc" className="in" value={country} onChange={x => { setCountry(x.target.value); setService(''); setToken(''); }}><option value="">{cs.l ? 'Chargement…' : 'Choisir…'}</option>{(cs.d?.countries ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><Err m={cs.e} />
    {country && <><label htmlFor="ps">Service</label><select id="ps" className="in" value={service} onChange={x => { setService(x.target.value); setToken(''); }}><option value="">{ss.l ? 'Chargement…' : 'Choisir…'}</option>{(ss.d?.services ?? []).map(s => <option key={s.code} value={s.code}>{s.name} — {money(s.price)} ({s.available} dispo.)</option>)}</select><Err m={ss.e} />{!ss.l && ss.d && !ss.d.services.length && <p className="mut">Aucun service disponible pour ce pays.</p>}</>}
    {service && q.d?.options?.length > 1 && <><label htmlFor="pr">Qualité de numéro</label><select id="pr" className="in" value={token} onChange={x => setToken(x.target.value)}><option value="">{q.d.options.find((o: any) => o.recommended)?.label ?? 'Recommandé'} (recommandé) — {money(q.d.price)}</option>{q.d.options.filter((o: any) => !o.recommended).map((o: any) => <option key={o.token} value={o.token}>{o.label} — {money(o.price)}{o.count != null ? ` (${o.count} dispo.)` : ''}</option>)}</select></>}
    <Err m={q.e} />
    {price !== undefined && <div className="kv"><div className="tot">Total à payer <b>{money(price)}</b></div><div className="mut">Solde disponible : {money(avail)}</div></div>}
    {price !== undefined && !enough && <p className="err" role="alert">Solde disponible insuffisant pour cet achat.</p>}<Err m={e} />
    <button className="btn p" disabled={busy || !enough} onClick={async () => { setE(''); setBusy(true); try { const o = await api('/api/proxnum/virtual/buy', { method: 'POST', body: JSON.stringify({ ref: pref, service, country: Number(country), ...(token ? { priceToken: token } : {}), expected: units(price!) }) }); setPref(newRef()); onOrder(o); } catch (x) { setE(msg(x)); } setBusy(false); }}>{busy ? 'Achat en cours…' : 'Acheter le numéro'}</button></div>;
}
function Rental({ avail, onOrder }: { avail: number; onOrder: (o: any) => void }) {
  const [country, setCountry] = useState(''), [hours, setHours] = useState(0), [pick, setPick] = useState(''), [e, setE] = useState(''), [busy, setBusy] = useState(false), [pref, setPref] = useState(newRef);
  const c = useGet<any>(`/api/proxnum/rental/catalog?${country ? `country=${country}&` : ''}${hours ? `hours=${hours}` : ''}`);
  useEffect(() => { if (c.d) { if (!country && c.d.country) setCountry(c.d.country); if (!hours && c.d.hours) setHours(c.d.hours); } }, [c.d]); // eslint-disable-line react-hooks/exhaustive-deps
  const s = c.d?.services?.find((x: any) => x.code === pick), enough = s && avail >= Number(s.price);
  return <div className="stack"><p className="mut" style={{ margin: 0 }}>Gardez un numéro plusieurs jours et recevez tous les SMS qu’il reçoit. Annulation possible dans les {Math.round((c.d?.cancelWindowSeconds ?? 120) / 60)} minutes suivant l’achat, tant qu’aucun SMS n’est arrivé et que la location n’a pas été prolongée.</p>
    {c.d && <><label htmlFor="rc">Pays</label><select id="rc" className="in" value={country} onChange={x => { setCountry(x.target.value); setPick(''); }}>{c.d.countries.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
      <label htmlFor="rh">Durée</label><select id="rh" className="in" value={hours} onChange={x => { setHours(Number(x.target.value)); setPick(''); }}>{c.d.durations.map((d: any) => <option key={d.hours} value={d.hours}>{d.label}</option>)}</select></>}
    <Err m={c.e} />{c.l && !c.d && <p className="mut">Chargement…</p>}
    {c.d && (c.d.services.length ? <div className="stack" style={{ gap: 8 }}>{c.d.services.map((x: any) => <button key={x.code} type="button" className={'btn' + (pick === x.code ? ' p' : '')} disabled={x.stock <= 0} aria-pressed={pick === x.code} onClick={() => setPick(x.code)} style={{ justifyContent: 'space-between', display: 'flex', width: '100%' }}><span>{x.name}</span><span>{money(x.price)} · {x.stock > 0 ? `${x.stock} dispo.` : 'épuisé'}</span></button>)}</div> : <p className="mut">Aucun service disponible pour ce pays et cette durée.</p>)}
    {s && <div className="kv"><div className="tot">Total à payer <b>{money(s.price)}</b></div><div className="mut">Solde disponible : {money(avail)}</div></div>}
    {s && !enough && <p className="err" role="alert">Solde disponible insuffisant pour cette location.</p>}<Err m={e} />
    <button className="btn p" disabled={busy || !enough} onClick={async () => { setE(''); setBusy(true); try { const o = await api('/api/proxnum/rental/buy', { method: 'POST', body: JSON.stringify({ ref: pref, service: pick, country: Number(country), hours, expected: units(s.price) }) }); setPref(newRef()); setPick(''); onOrder(o); } catch (x) { setE(msg(x)); } setBusy(false); }}>{busy ? 'Achat en cours…' : 'Louer le numéro'}</button></div>;
}
export default function ProxNum() {
  const [tab, setTab] = useState<'virtual' | 'rental' | 'history'>('virtual'), [page, setPage] = useState(1), [cur, setCur] = useState<any>(null), [open, setOpen] = useState<any>(null);
  const bal = useData('/api/balance'), h = useData(`/api/proxnum/orders?page=${page}&size=10`); const avail = Number(bal.data?.available ?? 0);
  const refresh = useCallback(() => { bal.reload(); h.reload(); }, [bal.reload, h.reload]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = (o: any) => { setCur(o); refresh(); };
  if (h.error === msg({ message: 'proxnum_disabled' })) return <div className="stack"><PageHead title="ProxNum" sub="Numéros virtuels pour recevoir vos SMS de vérification." /><Empty title="Service bientôt disponible" hint="Les numéros virtuels ne sont pas encore activés sur ce compte." /></div>;
  return <div className="stack"><PageHead title="ProxNum" sub="Numéros virtuels pour recevoir vos SMS de vérification, payés avec votre solde disponible." />
    <div className="g4"><Stat icon={Wallet} label="Solde disponible" value={money(bal.data?.available)} /></div>
    <div className="tabs" role="tablist">{([['virtual', 'Numéro temporaire', Phone], ['rental', 'Location', Clock], ['history', 'Mes numéros', MessageSquare]] as const).map(([k, l, I]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><I size={15} style={{ verticalAlign: -2, marginRight: 6 }} />{l}</button>)}</div>
    {cur && tab !== 'history' && <Order key={cur.id} first={cur} onChange={refresh} />}
    {tab === 'virtual' && <div className="card"><Virtual avail={avail} onOrder={done} /></div>}
    {tab === 'rental' && <div className="card"><Rental avail={avail} onOrder={done} /></div>}
    {tab === 'history' && <>{open && <Order key={open.id} first={open} onChange={refresh} />}
      <DataTable loading={h.loading} rows={h.data?.items ?? []} empty="Aucun numéro pour le moment" server={{ total: h.data?.total ?? 0, page, size: 10, onPage: setPage }} cols={[
        { key: 'service', label: 'Service', render: (o: any) => `${o.serviceName} · ${o.countryName}` }, { key: 'kind', label: 'Type', render: (o: any) => o.kind === 'rental' ? `Location ${o.hours ?? ''} h` : 'Temporaire' },
        { key: 'phone', label: 'Numéro', render: (o: any) => o.phone ?? '—' }, { key: 'status', label: 'Statut', render: (o: any) => o.refunded ? 'Remboursé' : (ST[o.status] ?? o.status) }, { key: 'createdAt', label: 'Date', render: (o: any) => o.createdAt ? day(new Date(o.createdAt).toISOString()) : '—' },
        { key: 'total', label: 'Total', right: true, num: true, render: (o: any) => money(o.total) }, { key: 'id', label: '', right: true, render: (o: any) => <button className="btn sm" onClick={() => setOpen(o)}>Ouvrir</button> }]} /></>}</div>;
}
