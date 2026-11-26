'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock, MessageSquare, Phone, RefreshCw, Wallet, X } from 'lucide-react';
import { CopyRow } from '@/components/CopyBtn';
import { api, msg, useData } from '@/lib/client';
import { day, Empty, PageHead, Stat } from '@/components/Bits';
import DataTable from '@/components/DataTable';
import { Err } from '@/components/Wizard';
import Combo from '@/components/Combo';
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
// Récapitulatif toujours visible à côté des choix : le bouton d'achat ne se retrouve jamais en bas d'une longue liste.
function Summary({ rows, total, avail, busy, label, onBuy, error, note }: { rows: [string, string][]; total?: string; avail: number; busy: boolean; label: string; onBuy: () => void; error: string; note: string }) {
  const ready = total !== undefined, enough = ready && avail >= Number(total);
  return <div className="card pxs stack" style={{ gap: 14 }}><h3 style={{ margin: 0 }}>Récapitulatif</h3>
    <div className="kv">{rows.map(([k, v]) => <div key={k}>{k} <b>{v}</b></div>)}<div className="tot">Total à payer <b>{ready ? money(total) : '—'}</b></div><div className="mut">Solde disponible : {money(avail)}</div></div>
    {ready && !enough && <p className="err" role="alert">Solde disponible insuffisant pour cet achat.</p>}<Err m={error} />
    <button className="btn p lg full" disabled={busy || !enough} onClick={onBuy}>{busy ? 'Achat en cours…' : label}</button><p className="mut" style={{ margin: 0, fontSize: 13 }}>{note}</p></div>;
}
function Virtual({ avail, onOrder }: { avail: number; onOrder: (o: any) => void }) {
  const [country, setCountry] = useState(''), [service, setService] = useState(''), [token, setToken] = useState(''), [e, setE] = useState(''), [busy, setBusy] = useState(false), [pref, setPref] = useState(newRef);
  const cs = useGet<{ countries: any[] }>('/api/proxnum/virtual/countries'), ss = useGet<{ services: any[] }>(country ? `/api/proxnum/virtual/services?country=${country}` : null), q = useGet<any>(country && service ? `/api/proxnum/virtual/quote?service=${service}&country=${country}` : null);
  const cOpts = useMemo(() => (cs.d?.countries ?? []).map(c => ({ value: c.id, label: c.name })), [cs.d]), sOpts = useMemo(() => (ss.d?.services ?? []).map(x => ({ value: x.code, label: x.name, hint: `${money(x.price)} · ${x.available} dispo.` })), [ss.d]);
  const svc = ss.d?.services.find(x => x.code === service), opt = q.d?.options?.find((o: any) => o.token === token), price: string | undefined = opt?.price ?? q.d?.price ?? svc?.price;
  const qOpts = (q.d?.options ?? []).map((o: any) => ({ value: o.recommended ? '' : o.token, label: `${o.label}${o.recommended ? ' (recommandé)' : ''}`, hint: `${money(o.price)}${o.count != null ? ` · ${o.count} dispo.` : ''}` }));
  const buy = async () => { setE(''); setBusy(true); try { const o = await api('/api/proxnum/virtual/buy', { method: 'POST', body: JSON.stringify({ ref: pref, service, country: Number(country), ...(token ? { priceToken: token } : {}), expected: units(price!) }) }); setPref(newRef()); onOrder(o); } catch (x) { setE(msg(x)); } setBusy(false); };
  return <div className="pxg"><div className="card stack" style={{ gap: 16 }}><p className="mut" style={{ margin: 0 }}>Un numéro temporaire pour recevoir un seul SMS de vérification. Si aucun SMS n’arrive, annulez pour être remboursé (quand l’annulation est acceptée).</p>
      <Combo label="Pays" value={country} options={cOpts} loading={cs.l} onChange={v => { setCountry(v); setService(''); setToken(''); }} /><Err m={cs.e} />
      <Combo label="Service" value={service} options={sOpts} loading={ss.l} disabled={!country} placeholder={country ? 'Choisir un service…' : 'Choisissez d’abord un pays'} emptyText="Aucun service disponible" onChange={v => { setService(v); setToken(''); }} /><Err m={ss.e} />
      {service && <div className="stack" style={{ gap: 6 }}><Combo label="Qualité de numéro (choix du prix)" value={token} options={qOpts} loading={q.l} disabled={q.l || qOpts.length < 2} onChange={setToken} placeholder={qOpts.length < 2 ? 'Recommandé (seule option)' : 'Recommandé'} /><p className="mut" style={{ margin: 0, fontSize: 13 }}>{q.l ? 'Chargement des qualités disponibles…' : qOpts.length > 1 ? `${qOpts.length} qualités disponibles : le prix et le nombre de numéros varient. « Recommandé » est choisi par défaut.` : 'Une seule qualité est disponible pour ce service : la recommandée.'}</p></div>}<Err m={q.e} /></div>
    <Summary rows={[['Pays', cOpts.find(c => c.value === country)?.label ?? '—'], ['Service', svc?.name ?? '—'], ...(service ? [['Qualité', qOpts.find((o: any) => o.value === token)?.label ?? 'Recommandé'] as [string, string]] : [])]} total={service ? price : undefined} avail={avail} busy={busy} label="Acheter le numéro" onBuy={buy} error={e} note="Débité de votre solde disponible, uniquement à l’achat." /></div>;
}
function Rental({ avail, onOrder }: { avail: number; onOrder: (o: any) => void }) {
  const [country, setCountry] = useState(''), [hours, setHours] = useState(0), [pick, setPick] = useState(''), [e, setE] = useState(''), [busy, setBusy] = useState(false), [pref, setPref] = useState(newRef);
  const c = useGet<any>(`/api/proxnum/rental/catalog?${country ? `country=${country}&` : ''}${hours ? `hours=${hours}` : ''}`);
  useEffect(() => { if (c.d) { if (!country && c.d.country) setCountry(c.d.country); if (!hours && c.d.hours) setHours(c.d.hours); } }, [c.d]); // eslint-disable-line react-hooks/exhaustive-deps
  const cOpts = useMemo(() => (c.d?.countries ?? []).map((x: any) => ({ value: x.id, label: x.name })), [c.d]), dOpts = useMemo(() => (c.d?.durations ?? []).map((d: any) => ({ value: String(d.hours), label: d.label })), [c.d]);
  const sOpts = useMemo(() => (c.d?.services ?? []).map((x: any) => ({ value: x.code, label: x.name, hint: x.stock > 0 ? `${money(x.price)} · ${x.stock} dispo.` : 'épuisé', disabled: x.stock <= 0 })), [c.d]);
  const s = c.d?.services?.find((x: any) => x.code === pick);
  const buy = async () => { setE(''); setBusy(true); try { const o = await api('/api/proxnum/rental/buy', { method: 'POST', body: JSON.stringify({ ref: pref, service: pick, country: Number(country), hours, expected: units(s.price) }) }); setPref(newRef()); setPick(''); onOrder(o); } catch (x) { setE(msg(x)); } setBusy(false); };
  return <div className="pxg"><div className="card stack" style={{ gap: 16 }}><p className="mut" style={{ margin: 0 }}>Gardez un numéro plusieurs jours et recevez tous ses SMS. Annulation possible dans les {Math.round((c.d?.cancelWindowSeconds ?? 120) / 60)} minutes suivant l’achat, tant qu’aucun SMS n’est arrivé et que la location n’est pas prolongée.</p>
      <Combo label="Pays" value={country} options={cOpts} loading={c.l && !c.d} onChange={v => { setCountry(v); setPick(''); }} />
      <Combo label="Durée" value={String(hours || '')} options={dOpts} loading={c.l && !c.d} onChange={v => { setHours(Number(v)); setPick(''); }} />
      <Combo label="Service" value={pick} options={sOpts} loading={c.l} placeholder="Choisir un service…" emptyText="Aucun service disponible" onChange={setPick} /><Err m={c.e} /></div>
    <Summary rows={[['Pays', cOpts.find((x: any) => x.value === country)?.label ?? '—'], ['Durée', dOpts.find((x: any) => x.value === String(hours))?.label ?? '—'], ['Service', s?.name ?? '—']]} total={s?.price} avail={avail} busy={busy} label="Louer le numéro" onBuy={buy} error={e} note="Débité de votre solde disponible, uniquement à l’achat." /></div>;
}
export default function ProxNum() {
  const [tab, setTab] = useState<'virtual' | 'rental' | 'history'>('virtual'), [page, setPage] = useState(1), [cur, setCur] = useState<any>(null), [open, setOpen] = useState<any>(null);
  const curRef = useRef<HTMLDivElement>(null), bal = useData('/api/balance'), h = useData(`/api/proxnum/orders?page=${page}&size=10`); const avail = Number(bal.data?.available ?? 0);
  const refresh = useCallback(() => { bal.reload(); h.reload(); }, [bal.reload, h.reload]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = (o: any) => { setCur(o); refresh(); setTimeout(() => curRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); };
  if (h.error === msg({ message: 'proxnum_disabled' })) return <div className="stack"><PageHead title="ProxNum" sub="Numéros virtuels pour recevoir vos SMS de vérification." /><Empty title="Service bientôt disponible" hint="Les numéros virtuels ne sont pas encore activés sur ce compte." /></div>;
  return <div className="stack"><PageHead title="ProxNum" sub="Numéros virtuels pour recevoir vos SMS de vérification, payés avec votre solde disponible." />
    <div className="g4"><Stat icon={Wallet} label="Solde disponible" value={money(bal.data?.available)} /></div>
    <div className="tabs" role="tablist">{([['virtual', 'Numéro temporaire', Phone], ['rental', 'Location', Clock], ['history', 'Mes numéros', MessageSquare]] as const).map(([k, l, I]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><I size={15} style={{ verticalAlign: -2, marginRight: 6 }} />{l}</button>)}</div>
    {tab === 'virtual' && <Virtual avail={avail} onOrder={done} />}
    {tab === 'rental' && <Rental avail={avail} onOrder={done} />}
    {cur && tab !== 'history' && <div ref={curRef}><Order key={cur.id} first={cur} onChange={refresh} /></div>}
    {tab === 'history' && <>{open && <Order key={open.id} first={open} onChange={refresh} />}
      <DataTable loading={h.loading} rows={h.data?.items ?? []} empty="Aucun numéro pour le moment" server={{ total: h.data?.total ?? 0, page, size: 10, onPage: setPage }} cols={[
        { key: 'service', label: 'Service', render: (o: any) => `${o.serviceName} · ${o.countryName}` }, { key: 'kind', label: 'Type', render: (o: any) => o.kind === 'rental' ? `Location ${o.hours ?? ''} h` : 'Temporaire' },
        { key: 'phone', label: 'Numéro', render: (o: any) => o.phone ?? '—' }, { key: 'status', label: 'Statut', render: (o: any) => o.refunded ? 'Remboursé' : (ST[o.status] ?? o.status) }, { key: 'createdAt', label: 'Date', render: (o: any) => o.createdAt ? day(new Date(o.createdAt).toISOString()) : '—' },
        { key: 'total', label: 'Total', right: true, num: true, render: (o: any) => money(o.total) }, { key: 'id', label: '', right: true, render: (o: any) => <button className="btn sm" onClick={() => setOpen(o)}>Ouvrir</button> }]} /></>}</div>;
}
