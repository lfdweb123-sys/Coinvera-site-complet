'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock, MessageCircle, Phone, RefreshCw, Undo2, Wallet, X } from 'lucide-react';
import { CopyRow } from '@/components/CopyBtn';
import { api, msg, useData } from '@/lib/client';
import { day, Empty, PageHead, Stat } from '@/components/Bits';
import DataTable from '@/components/DataTable';
import { Err } from '@/components/Wizard';
import Combo from '@/components/Combo';
import TopupModal from '@/components/TopupModal';
// Numéros WhatsApp / Telegram (vérification par SMS), payés uniquement avec le solde disponible. Le prix est recalculé côté serveur à l'achat.
const usd = (n: number | string | null | undefined) => n == null || n === '' || isNaN(Number(n)) ? '—' : Number(n).toLocaleString('fr-FR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const xof = (n: number) => `${n.toLocaleString('fr-FR')} XOF`;
const newRef = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random().toString(16).slice(2)}`).replace(/-/g, '').slice(0, 32);
const ST: Record<string, string> = { reserved: 'Achat en cours', review: 'Vérification', waiting: 'En attente du code', received: 'Code reçu', failed: 'Remboursé' };
const BADGE: Record<string, string> = { reserved: 'warn', review: 'warn', waiting: 'warn', received: 'ok', failed: 'info' };
const REASON: Record<string, string> = { user_cancel: 'Annulation acceptée.', timeout: 'Aucun code reçu dans le délai.', number_used: 'Numéro signalé comme déjà utilisé.', canceled: 'Numéro annulé.', banned: 'Numéro refusé.', purchase_not_found: 'L’achat n’a pas abouti.', no_free_phones: 'Aucun numéro libre.' };
const live = (o: any) => o.status === 'reserved' || o.status === 'review' || o.status === 'waiting';
function useGet<T = any>(path: string | null) {
  const [d, setD] = useState<T | null>(null), [e, setE] = useState(''), [l, setL] = useState(false);
  useEffect(() => { if (!path) { setD(null); setE(''); return; } let stop = false; setL(true); setE(''); api(path).then(r => !stop && setD(r)).catch(x => !stop && (setE(msg(x)), setD(null))).finally(() => !stop && setL(false)); return () => { stop = true; }; }, [path]);
  return { d, e, l };
}
function Countdown({ to }: { to: number }) {
  const [now, setNow] = useState(Date.now()); useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.floor((to - now) / 1000)); return <span>{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</span>;
}
function Order({ first, onChange, onNew }: { first: any; onChange?: () => void; onNew?: (o: any) => void }) {
  const [o, setO] = useState(first), [e, setE] = useState(''), [busy, setBusy] = useState(false); const t = useRef<any>(null);
  useEffect(() => setO(first), [first.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let stop = false; const tick = async () => { try { const r = await api(`/api/numbers/orders/${o.id}`); if (stop) return; setO(r); if (!live(r)) { onChange?.(); return; } } catch { /* on réessaie */ } t.current = setTimeout(tick, 4000); };
    if (live(o)) t.current = setTimeout(tick, 3000); return () => { stop = true; clearTimeout(t.current); };
  }, [o.id, live(o)]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (path: string, body?: unknown, fresh?: boolean) => { setE(''); setBusy(true); try { const r = await api(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }); if (fresh) onNew?.(r); else setO(r); onChange?.(); } catch (x) { setE(msg(x)); } finally { setBusy(false); } };
  return <div className="card stack" style={{ gap: 12 }}>
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><b>{o.serviceName} · {o.countryName}</b><span className={'badge ' + (BADGE[o.status] ?? 'info')}>{ST[o.status] ?? o.status}</span><span className="mut" style={{ marginLeft: 'auto' }}>{xof(o.priceXof)} · {usd(o.priceUsd)}</span></div>
    {o.status === 'reserved' && <p className="mut" role="status">Achat en cours… votre numéro apparaît dans quelques instants.</p>}
    {o.status === 'review' && <p className="mut" role="status">Vérification en cours : le résultat de votre achat est en cours de confirmation. Vos fonds sont protégés : ils seront réglés ou remis sur votre solde automatiquement.</p>}
    {o.phone && <CopyRow label="Numéro" value={o.phone} mono />}
    {o.status === 'waiting' && <>
      <p className="mut" role="status"><Clock size={14} style={{ verticalAlign: -2 }} /> En attente du code… (actualisation automatique) {o.expiresAt ? <>Il reste <b><Countdown to={o.expiresAt} /></b>.</> : null}</p>
      <p className="mut" style={{ margin: 0, fontSize: 13.5 }}>Saisissez ce numéro dans {o.serviceName}, demandez le code par SMS{o.options?.voice ? ' (ou par appel)' : ''}, il apparaîtra ici.</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><button className="btn" disabled={busy} onClick={() => act(`/api/numbers/orders/${o.id}/cancel`)}><X size={15} /> Annuler et être remboursé</button>
        <button className="btn" disabled={busy} onClick={() => act(`/api/numbers/orders/${o.id}/report`)}><Undo2 size={15} /> Numéro déjà utilisé</button></div></>}
    {o.status === 'received' && <><div className="kv"><div>Code <b style={{ fontSize: 28, letterSpacing: 2 }}>{o.code || '—'}</b></div>{o.smsText ? <div className="mut">{o.smsText}</div> : null}</div>{o.code ? <CopyRow label="Copier le code" value={o.code} mono /> : null}
      {o.canReuse && <div><button className="btn" disabled={busy} onClick={() => act(`/api/numbers/orders/${o.id}/reuse`, { ref: newRef() }, true)}><RefreshCw size={15} /> Racheter ce numéro ({xof(o.priceXof)})</button></div>}</>}
    {o.status === 'failed' && <><p className="okm" role="status">{REASON[o.error ?? ''] ?? 'La commande n’a pas abouti.'} {usd(o.priceUsd)} ont été remis sur votre solde.</p></>}
    <Err m={e} /></div>;
}
function Buy({ avail, onOrder, onTopup }: { avail: number; onOrder: (o: any) => void; onTopup: () => void }) {
  const cat = useGet<any>('/api/numbers/catalog');
  const [service, setService] = useState('whatsapp'), [country, setCountry] = useState(''), [operator, setOperator] = useState('any'), [reuse, setReuse] = useState(false), [voice, setVoice] = useState(false), [fwd, setFwd] = useState(false), [num, setNum] = useState('');
  const [e, setE] = useState(''), [busy, setBusy] = useState(false), [ref, setRef] = useState(newRef);
  const list: any[] = cat.d?.countries?.[service] ?? [], price = cat.d?.price, c = list.find(x => x.slug === country);
  const cOpts = useMemo(() => list.map(x => ({ value: x.slug, label: x.name, hint: `${x.count.toLocaleString('fr-FR')} numéros${x.rate != null ? ` · ${Math.round(x.rate)} % de codes reçus` : ''}` })), [cat.d, service]); // eslint-disable-line react-hooks/exhaustive-deps
  const oOpts = useMemo(() => [{ value: 'any', label: 'Tous les opérateurs (recommandé)' }, ...(c?.operators ?? []).map((o: any) => ({ value: o.name, label: o.name, hint: `${o.count.toLocaleString('fr-FR')} numéros${o.rate != null ? ` · ${Math.round(o.rate)} % de codes reçus` : ''}` }))], [c]);
  const enough = price?.usd != null && avail >= price.usd, fwdOk = !fwd || /^\d{11}$/.test(num), ready = !!country && !!price && fwdOk;
  const buy = async () => { setE(''); setBusy(true); try { const o = await api('/api/numbers/orders', { method: 'POST', body: JSON.stringify({ ref, service, country, ...(operator !== 'any' ? { operator } : {}), ...(reuse ? { reuse: true } : {}), ...(voice ? { voice: true } : {}), ...(fwd ? { forwardingNumber: num } : {}) }) }); setRef(newRef()); onOrder(o); } catch (x) { setE(msg(x)); } setBusy(false); };
  return <div className="pxg"><div className="card stack" style={{ gap: 16 }}>
    <p className="mut" style={{ margin: 0 }}>C’est une <b>vérification</b> : un numéro temporaire, valable environ 15 minutes, qui reçoit le code de vérification demandé. Ce n’est pas un numéro à conserver. Si aucun code n’arrive ou si vous annulez, vous êtes remboursé aussitôt.</p>
    <div className="tabs" role="tablist">{(cat.d?.services ?? [{ key: 'whatsapp', label: 'WhatsApp' }, { key: 'telegram', label: 'Telegram' }]).map((s: any) => <button key={s.key} role="tab" aria-selected={service === s.key} className={service === s.key ? 'on' : ''} onClick={() => { setService(s.key); setCountry(''); setOperator('any'); }}><MessageCircle size={15} style={{ verticalAlign: -2, marginRight: 6 }} />{s.label}</button>)}</div>
    <Combo label="Pays" value={country} options={cOpts} loading={cat.l} placeholder="Choisir un pays…" emptyText="Aucun pays disponible pour le moment" onChange={v => { setCountry(v); setOperator('any'); }} /><Err m={cat.e} />
    {c && c.operators.length > 1 && <Combo label="Opérateur" value={operator} options={oOpts} onChange={setOperator} />}
    <div className="stack" style={{ gap: 8 }}>
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}><input type="checkbox" checked={reuse} onChange={x => setReuse(x.target.checked)} /><span>Pouvoir racheter ce numéro plus tard <span className="mut">(option de réutilisation)</span></span></label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}><input type="checkbox" checked={voice} onChange={x => setVoice(x.target.checked)} /><span>Autoriser aussi la validation par appel vocal</span></label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}><input type="checkbox" checked={fwd} onChange={x => setFwd(x.target.checked)} /><span>Renvoyer l’appel vers mon téléphone</span></label>
      {fwd && <div><input className="in" inputMode="numeric" placeholder="Numéro de renvoi, 11 chiffres sans le +" value={num} onChange={x => setNum(x.target.value.replace(/\D/g, '').slice(0, 11))} aria-label="Numéro de renvoi" />{!fwdOk && num && <p className="err" role="alert" style={{ margin: '6px 0 0' }}>Le numéro de renvoi doit comporter 11 chiffres.</p>}</div>}</div></div>
    <div className="card pxs stack" style={{ gap: 14 }}><h3 style={{ margin: 0 }}>Récapitulatif</h3>
      <div className="kv"><div>Service <b>{service === 'telegram' ? 'Telegram' : 'WhatsApp'}</b></div><div>Pays <b>{c?.name ?? '—'}</b></div>{operator !== 'any' && <div>Opérateur <b>{operator}</b></div>}
        <div className="tot">Total à payer <b>{price ? xof(price.xof) : '—'}</b></div>{price?.usd != null && <div className="mut">soit {usd(price.usd)} au taux du jour</div>}<div className="mut">Solde disponible : {usd(avail)}</div></div>
      {ready && !enough && <p className="err" role="alert">Solde disponible insuffisant pour cet achat. Rechargez votre solde pour continuer.</p>}<Err m={e} />
      {ready && !enough ? <button className="btn p lg full" onClick={onTopup}><Wallet size={16} style={{ verticalAlign: -3, marginRight: 6 }} />Recharger mon solde</button>
        : <button className="btn p lg full" disabled={busy || !ready} onClick={buy}>{busy ? 'Achat en cours…' : 'Obtenir un numéro'}</button>}
      <p className="mut" style={{ margin: 0, fontSize: 13 }}>Débité de votre solde disponible, uniquement à l’achat et seulement si vous avez les fonds. Remboursé aussitôt si le code n’arrive pas.</p></div></div>;
}
export default function Numeros() {
  const [tab, setTab] = useState<'buy' | 'history'>('buy'), [page, setPage] = useState(1), [cur, setCur] = useState<any>(null), [open, setOpen] = useState<any>(null), [top, setTop] = useState(false);
  const curRef = useRef<HTMLDivElement>(null), bal = useData('/api/balance'), h = useData(`/api/numbers/orders?page=${page}&size=10`); const avail = Number(bal.data?.available ?? 0);
  const refresh = useCallback(() => { bal.reload(); h.reload(); }, [bal.reload, h.reload]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = (o: any) => { setCur(o); refresh(); setTimeout(() => curRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); };
  if (h.error === msg({ message: 'numbers_disabled' })) return <div className="stack"><PageHead title="Numéros WhatsApp et Telegram" sub="Numéros temporaires pour recevoir vos codes de vérification." /><Empty title="Service bientôt disponible" hint="Les numéros ne sont pas encore activés sur ce compte." /></div>;
  return <div className="stack"><PageHead title="Numéros WhatsApp et Telegram" sub="Recevez le code de vérification de WhatsApp ou Telegram sur un numéro temporaire, payé avec votre solde disponible." />
    <div className="g4"><Stat icon={Wallet} label="Solde disponible" value={usd(bal.data?.available)} /></div>
    <div><button className="btn" onClick={() => setTop(true)}><Wallet size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Recharger mon solde</button></div>
    {top && <TopupModal onClose={() => setTop(false)} onDone={() => { bal.reload(); }} />}
    <div className="tabs" role="tablist">{([['buy', 'Obtenir un numéro', Phone], ['history', 'Mes numéros', MessageCircle]] as const).map(([k, l, I]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><I size={15} style={{ verticalAlign: -2, marginRight: 6 }} />{l}</button>)}</div>
    {tab === 'buy' && <Buy avail={avail} onOrder={done} onTopup={() => setTop(true)} />}
    {cur && tab === 'buy' && <div ref={curRef}><Order key={cur.id} first={cur} onChange={refresh} onNew={done} /></div>}
    {tab === 'history' && <>{open && <Order key={open.id} first={open} onChange={refresh} onNew={o => { setOpen(o); refresh(); }} />}
      <DataTable loading={h.loading} rows={h.data?.items ?? []} empty="Aucun numéro pour le moment" server={{ total: h.data?.total ?? 0, page, size: 10, onPage: setPage }} cols={[
        { key: 'service', label: 'Service', render: (o: any) => `${o.serviceName} · ${o.countryName}` }, { key: 'phone', label: 'Numéro', render: (o: any) => o.phone ?? '—' }, { key: 'code', label: 'Code', render: (o: any) => o.code ?? '—' },
        { key: 'status', label: 'Statut', render: (o: any) => ST[o.status] ?? o.status }, { key: 'createdAt', label: 'Date', render: (o: any) => o.createdAt ? day(new Date(o.createdAt).toISOString()) : '—' },
        { key: 'priceUsd', label: 'Prix', right: true, num: true, render: (o: any) => usd(o.priceUsd) }, { key: 'id', label: '', right: true, render: (o: any) => <button className="btn sm" onClick={() => setOpen(o)}>Ouvrir</button> }]} /></>}</div>;
}
