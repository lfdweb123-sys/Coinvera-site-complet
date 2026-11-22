'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { CopyRow } from '@/components/CopyBtn';
import { CreditCard, Eye, Plus, Snowflake, Trash2, X, ShieldCheck, KeyRound } from 'lucide-react';
import { api, auth, msg, useData } from '@/lib/client';
import { PageHead, usd, day, Empty } from '@/components/Bits';
const ST: Record<string, string> = { issuing: 'En création', active: 'Active', frozen: 'Gelée', suspended: 'Suspendue', closed: 'Fermée', expired: 'Expirée' };
const OS: Record<string, string> = { reserved: 'En cours', processing: 'En cours', confirmed: 'Terminée', failed: 'Échouée' };
const AMT = /^\d{1,6}(\.\d{1,2})?$/;
const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [onClose]);
  return <div className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={e => e.target === e.currentTarget && onClose()}><div className="mbox wide"><div className="mh"><h2>{title}</h2><button className="mx" aria-label="Fermer" onClick={onClose}><X size={18} /></button></div>{children}</div></div>;
};
const Err = ({ m }: { m: string }) => m ? <p className="err" role="alert">{m}</p> : null;
function usePoll(url: string | null, done: (d: any) => boolean, every = 5000) {
  const [d, setD] = useState<any>(null);
  useEffect(() => { if (!url) return; let stop = false, t: any; const tick = async () => { try { const r = await api(url); if (stop) return; setD(r); if (done(r)) return; } catch { /* on réessaie */ } t = setTimeout(tick, every); }; tick(); return () => { stop = true; clearTimeout(t); }; }, [url]); // eslint-disable-line react-hooks/exhaustive-deps
  return d;
}
function Wait({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const o = usePoll(`/api/cards/orders/${orderId}`, r => r.status === 'confirmed' || r.status === 'failed');
  useEffect(() => { if (o?.status === 'confirmed') onDone(); }, [o?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  if (o?.status === 'confirmed') return <p className="okm">Opération terminée. Votre carte est à jour.</p>;
  if (o?.status === 'failed') return <><Err m={msg({ message: o.error })} /><p className="mut">Les fonds ont été remis sur votre solde.</p></>;
  return <p className="mut" role="status">Opération en cours : la carte est créée ou rechargée en quelques minutes. Vous pouvez fermer cette fenêtre, elle apparaîtra dans la liste.</p>;
}
function PayDirect({ spec, onOrder, deposit, onDone }: { spec: any; onOrder?: (id: string) => void; deposit?: boolean; onDone?: () => void }) {
  const cur = useData('/api/cards/pay-orders'); const [c, setC] = useState(''), [po, setPo] = useState<any>(null), [e, setE] = useState(''), [qr, setQr] = useState('');
  const live = usePoll(po ? `/api/cards/pay-orders/${po.id}` : null, r => ['fulfilled', 'failed', 'late_credited', 'closed'].includes(r.status), 8000); const p = live ?? po;
  useEffect(() => { if (p?.status === 'fulfilled' && p.orderId) onOrder?.(p.orderId); if ((p?.status === 'fulfilled' && deposit) || p?.status === 'late_credited') onDone?.(); }, [p?.status, p?.orderId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (po) QRCode.toDataURL(po.address, { margin: 1, width: 180 }).then(setQr).catch(() => {}); }, [po?.address]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = cur.data?.currencies ?? [];
  if (!po) return <div className="stack"><label htmlFor="pc">Réseau de paiement (USDT)</label>
    <select id="pc" className="in" value={c} onChange={x => setC(x.target.value)}><option value="">Choisir…</option>{list.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
    {!cur.loading && !list.length && <p className="err" role="alert">Paiement direct indisponible : {msg({ message: cur.data?.problem ?? 'no_deposit_address' })}{cur.data?.problem && cur.data.problem !== 'no_deposit_address' ? ` (code : ${cur.data.problem})` : ''}</p>}<Err m={e} />
    <button className="btn p" disabled={!c} onClick={async () => { setE(''); try { setPo(await api(deposit ? '/api/cards/deposits' : '/api/cards/pay-orders', { method: 'POST', body: JSON.stringify({ ...spec, cur: c }) })); } catch (x) { setE(msg(x)); } }}>Afficher l’adresse de paiement</button></div>;
  if (p.status === 'late_credited') return <p className="okm" role="status">Paiement reçu après l’expiration : {usd(p.amountUsd)} ont été crédités sur votre crédit cartes. Vous pouvez recommencer votre commande.</p>;
  if (p.status === 'fulfilled' && deposit) return <p className="okm" role="status">Paiement reçu : {usd(p.amountUsd)} ont été crédités sur votre crédit cartes.</p>;
  if (p.status === 'expired' || p.status === 'closed') return <p className="err" role="status">Cette demande de paiement a expiré. Si vous avez déjà envoyé le montant exact, il sera détecté et crédité automatiquement sur votre crédit cartes (jusqu’à 7 jours) : inutile de renvoyer des fonds.</p>;
  if (p.status === 'failed') return <><Err m={msg({ message: p.error })} /><p className="mut">Votre paiement a été reçu : le montant a été crédité sur votre crédit cartes.</p></>;
  if (p.status === 'paid' || p.status === 'fulfilled') return <p className="mut" role="status">Paiement reçu. {deposit ? 'Crédit en cours…' : 'Création de l’opération en cours…'}</p>;
  return <div className="stack"><p className="mut" style={{ margin: 0 }}>Envoyez <b>exactement</b> ce montant, sur le réseau indiqué : le montant exact permet d’identifier votre paiement. Valable 60 minutes.</p>
    <CopyRow label="Montant exact à envoyer (USDT)" value={String(p.amount)} shown={`${p.amount} USDT`} /><CopyRow label="Réseau" value={String(p.net)} /><CopyRow label="Adresse de paiement" value={p.address} mono />
    {qr && <img src={qr} alt="QR code de l’adresse de paiement" width={160} height={160} style={{ justifySelf: 'center' }} />}<p className="mut" role="status" style={{ margin: 0 }}>En attente du paiement… (vérification automatique)</p></div>;
}
function Deposit({ amount: a0, onClose, onDone }: { amount?: number; onClose: () => void; onDone: () => void }) {
  const [a, setA] = useState(String(a0 && a0 >= 5 ? a0 : 20)), [go, setGo] = useState(false); const ok = AMT.test(a) && Number(a) >= 5 && Number(a) <= 10000;
  return <Modal title="Recharger mon crédit cartes" onClose={() => { onClose(); onDone(); }}><div className="stack">
    <p className="mut">Le crédit cartes se recharge en USDT et sert uniquement à payer vos cartes (émission et recharges). Il n’est pas retirable. Le montant crédité est exactement celui envoyé.</p>
    {!go ? <><label htmlFor="da">Montant (USD, de 5 à 10 000)</label><input id="da" className="in" inputMode="decimal" value={a} onChange={x => setA(x.target.value)} /><button className="btn p" disabled={!ok} onClick={() => setGo(true)}>Continuer</button></> : <PayDirect spec={{ amount: Number(a).toFixed(2) }} deposit onDone={onDone} />}
  </div></Modal>;
}
function KycGate({ onOk }: { onOk: () => void }) {
  const [e, setE] = useState(''), [b, setB] = useState(false);
  return <div className="stack"><p><ShieldCheck size={16} /> Cette carte demande une vérification d’identité (une seule fois), assurée par notre prestataire.</p><Err m={e} />
    <button className="btn p" disabled={b} onClick={async () => { setE(''); setB(true); try { const r = await api('/api/cards/kyc', { method: 'POST' }); if (r.status === 'approved') onOk(); else if (r.url) window.open(r.url, '_blank', 'noopener'); } catch (x) { setE(msg(x)); } setB(false); }}>Vérifier mon identité</button>
    <button className="btn" onClick={async () => { setE(''); try { const r = await api('/api/cards/kyc'); if (r.status === 'approved') onOk(); else setE(r.status === 'pending' || r.status === 'review' ? 'Vérification en cours d’examen, réessayez dans quelques instants.' : 'Identité non encore validée.'); } catch (x) { setE(msg(x)); } }}>J’ai terminé la vérification</button></div>;
}
function Checkout({ kind, product, card, kyc, minAmount, onClose, onDone, onDeposit }: any) {
  const [amount, setAmount] = useState(String(minAmount ?? 5)), [name, setName] = useState(''), [q, setQ] = useState<any>(null), [e, setE] = useState(''), [mode, setMode] = useState<'' | 'direct'>(''), [orderId, setOrderId] = useState(''), [busy, setBusy] = useState(false), [kycOk, setKycOk] = useState(false);
  const spec = { kind, ...(kind === 'issue' ? { productCode: product.code, ...(name.trim().length >= 2 ? { nameOnCard: name.trim() } : {}) } : { cardId: card.id }), amount };
  const needKyc = kind === 'issue' && product.requiresKyc && kyc !== 'approved' && !kycOk;
  useEffect(() => { setQ(null); setE(''); if (needKyc || !AMT.test(amount) || orderId) return; const t = setTimeout(async () => { try { setQ(await api('/api/cards/quote', { method: 'POST', body: JSON.stringify(spec) })); } catch (x) { setE(msg(x)); } }, 450); return () => clearTimeout(t); }, [amount, needKyc]); // eslint-disable-line react-hooks/exhaustive-deps
  const title = kind === 'issue' ? 'Nouvelle carte virtuelle' : `Recharger la carte •••• ${card.last4 ?? ''}`;
  return <Modal title={title} onClose={() => { onClose(); if (orderId) onDone(); }}>
    {needKyc ? <KycGate onOk={() => setKycOk(true)} /> : orderId ? <Wait orderId={orderId} onDone={onDone} /> : <div className="stack">
      <label htmlFor="am">{kind === 'issue' ? 'Solde d’ouverture' : 'Montant à charger'} (USD){kind === 'issue' && <> — minimum {usd(product.minOpening)}</>}</label>
      <input id="am" className="in" inputMode="decimal" value={amount} onChange={x => setAmount(x.target.value)} />
      {kind === 'issue' && <><label htmlFor="nm">Nom sur la carte (facultatif)</label><input id="nm" className="in" maxLength={26} value={name} onChange={x => setName(x.target.value)} placeholder="JEAN DUPONT" /></>}
      {q && <div className="kv"><div>Montant sur la carte <b>{usd(q.amount)}</b></div><div>Frais (service et réseau){q.dynamic === false ? ' — estimation' : ''} <b>{usd(q.fees)}</b></div><div className="tot">Total à payer <b>{usd(q.total)}</b></div><div className="mut">Crédit cartes : {usd(q.credit)} · solde Coinvera : {usd(q.balance)}</div></div>}
      <Err m={e} />
      {q && (q.covers && mode === '' ? <><div className="btns"><button className="btn p" disabled={busy} onClick={async () => { setBusy(true); setE(''); try { setOrderId((await api('/api/cards/orders', { method: 'POST', body: JSON.stringify(spec) })).id); } catch (x) { setE(msg(x)); } setBusy(false); }}>Payer {usd(q.total)} avec mon solde</button>
        <button className="btn" onClick={() => setMode('direct')}>Ou payer directement en USDT</button></div></> :
        <>{!q.covers && <p role="status">Solde insuffisant : il vous manque <b>{usd(q.missing)}</b>. Rechargez votre crédit cartes en USDT, ou payez directement cette commande en USDT.</p>}
          {!q.covers && mode === '' && <div className="btns"><button className="btn p" onClick={() => onDeposit?.(Math.max(5, Math.ceil(Number(q.missing))))}>Recharger mon crédit cartes</button><button className="btn" onClick={() => setMode('direct')}>Payer cette commande en USDT</button></div>}
          {mode === 'direct' && <PayDirect spec={spec} onOrder={setOrderId} />}</>)}
    </div>}</Modal>;
}
function CardModal({ c, onClose, onChange }: { c: any; onClose: () => void; onChange: () => void }) {
  const det = useData(`/api/cards/${c.id}`), tx = useData(`/api/cards/${c.id}/transactions`); const [url, setUrl] = useState(''), [e, setE] = useState(''), [otp, setOtp] = useState<any>(null), [cq, setCq] = useState<any>(null), [busy, setBusy] = useState(false);
  const d = det.data; const run = async (f: () => Promise<any>) => { setE(''); setBusy(true); try { await f(); } catch (x) { setE(msg(x)); } setBusy(false); };
  return <Modal title={`Carte •••• ${c.last4 ?? ''}`} onClose={onClose}><div className="stack">
    {d && <div className="kv"><div>Statut <b>{ST[d.status] ?? d.status}</b></div><div>Solde disponible <b>{usd(d.balance)}</b></div>{d.expire && <div>Expire <b>{d.expire}</b></div>}</div>}
    <Err m={e || det.error} />
    {d?.status === 'active' || d?.status === 'frozen' ? <div className="btns">
      <button className="btn" disabled={busy} onClick={() => run(async () => { const r = await api(`/api/cards/${c.id}/reveal`, { method: 'POST' }); setUrl(r.revealUrl ?? ''); })}><Eye size={15} /> Voir la carte</button>
      <button className="btn" disabled={busy} onClick={() => run(async () => { await api(`/api/cards/${c.id}/freeze`, { method: 'POST', body: JSON.stringify({ action: d.status === 'frozen' ? 'unfreeze' : 'freeze' }) }); det.reload(); onChange(); })}><Snowflake size={15} /> {d.status === 'frozen' ? 'Dégeler' : 'Geler'}</button>
      <button className="btn" disabled={busy} onClick={() => run(async () => setOtp(await api(`/api/cards/${c.id}/otp`)))}><KeyRound size={15} /> Code de vérification{c.otpWaiting ? ' •' : ''}</button></div> : null}
    {url && /^https:\/\//.test(url) && <iframe src={url} title="Détails de la carte" referrerPolicy="no-referrer" allow="clipboard-write" style={{ display: 'block', width: '100%', maxWidth: 400, aspectRatio: '1.589/1', border: 0, borderRadius: 14, colorScheme: 'light' }} />}
    {otp && (otp.available ? <p role="status">Code <b style={{ fontSize: 22, letterSpacing: 2 }}>{otp.code}</b>{otp.merchantName ? ` — ${otp.merchantName}` : ''}{otp.amount ? ` ${otp.amount} ${otp.currency ?? ''}` : ''}. Valable {Math.round((otp.expiresIn ?? 0) / 60)} min, affiché une seule fois.</p> : <p className="mut">Aucun code en attente.</p>)}
    <h3 style={{ marginBottom: 0 }}>Dernières opérations</h3>
    {tx.data?.transactions?.length ? <div className="stack">{tx.data.transactions.map((t: any) => <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span>{t.type}{t.merchant ? ` · ${t.merchant}` : ''}<br /><small className="mut">{day(t.at)}{t.status === 'failed' ? ' · refusée' : t.status === 'processing' ? ' · en cours' : ''}</small></span><b>{t.amount ? usd(t.amount) : '—'}</b></div>)}</div> : <p className="mut">{tx.loading ? 'Chargement…' : 'Aucune opération.'}</p>}
    {d && d.status !== 'closed' && d.status !== 'expired' && (cq ? <div className="stack"><p>En fermant la carte, son solde (<b>{usd(cq.cardBalance)}</b>, moins les frais de fermeture) sera <b>remboursé sur votre compte Coinvera</b> : {usd(cq.refund)} estimés{cq.live ? '' : ' (estimation indisponible pour l’instant)'}. {cq.advance && cq.live ? 'Ce montant est crédité dès que la carte est fermée, puis ajusté au centime près quand l’émetteur confirme le remboursement réel' : 'Le montant est crédité quand l’émetteur confirme le remboursement'} (en général {cq.etaTypical ?? '24 à 48 h'}, jusqu’à {cq.etaMaxDays ?? 45} jours au plus). Action définitive.</p>
      <button className="btn p" disabled={busy} onClick={() => run(async () => { await api(`/api/cards/${c.id}/close`, { method: 'POST' }); setCq(null); det.reload(); onChange(); })}>Fermer définitivement la carte</button></div> :
      <button className="btn" disabled={busy} onClick={() => run(async () => setCq(await api(`/api/cards/${c.id}/close`)))}><Trash2 size={15} /> Fermer la carte</button>)}
  </div></Modal>;
}
const COUNTRIES = 'BJ,BF,CI,CM,CD,CG,GA,GH,GN,ML,MA,NE,NG,SN,TG,TN,DZ,EG,KE,TZ,UG,RW,ZA,MG,MR,TD,CF,BI,DJ,KM,MU,FR,BE,CH,LU,CA,US,GB,DE,ES,IT,PT,NL'.split(',');
const NAMES = new Intl.DisplayNames(['fr'], { type: 'region' });
function Onboard({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState<Record<string, string>>({ firstName: '', lastName: '', dateOfBirth: '', phone: '', country: 'BJ', address: '', city: '', zipCode: '', state: '', email: '' }), [e, setE] = useState(''), [b, setB] = useState(false);
  const set = (k: string) => (x: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF(p => ({ ...p, [k]: x.target.value }));
  useEffect(() => { const m = auth.currentUser?.email; if (m) setF(p => p.email ? p : { ...p, email: m }); }, []);
  const ok = ['firstName', 'lastName', 'email', 'dateOfBirth', 'phone', 'country', 'address', 'city', 'state', 'zipCode'].every(k => f[k].trim());
  const L = (id: string, label: string, ac: string, extra: any = {}) => <div key={id}><label htmlFor={'ob_' + id}>{label}</label><input id={'ob_' + id} className="in" autoComplete={ac} value={f[id]} onChange={set(id)} {...extra} /></div>;
  return <form className="card stack" style={{ maxWidth: 560 }} onSubmit={async ev => { ev.preventDefault(); setE(''); setB(true); try { await api('/api/cards/holder', { method: 'POST', body: JSON.stringify({ ...f, phone: f.phone.replace(/[\s.-]/g, ''), state: f.state.trim() }) }); onDone(); } catch (x) { setE(msg(x)); } setB(false); }}>
    <h2 style={{ margin: 0 }}>Créer mon compte carte</h2>
    <p className="mut">L’émetteur de la carte exige votre identité complète, telle qu’elle figure sur votre pièce d’identité. Ces informations lui sont transmises directement et ne sont pas conservées par Coinvera.</p>
    {L('firstName', 'Prénom', 'given-name')}{L('lastName', 'Nom', 'family-name')}{L('email', 'Adresse e-mail du compte carte', 'email', { type: 'email', inputMode: 'email' })}{L('dateOfBirth', 'Date de naissance', 'bday', { type: 'date', max: new Date().toISOString().slice(0, 10) })}
    {L('phone', 'Téléphone avec indicatif international (ex. +22997000000)', 'tel', { type: 'tel', inputMode: 'tel', placeholder: '+22997000000' })}
    <div><label htmlFor="ob_country">Pays de résidence</label><select id="ob_country" className="in" autoComplete="country" value={f.country} onChange={set('country')}>{COUNTRIES.map(c => <option key={c} value={c}>{NAMES.of(c) ?? c}</option>)}</select></div>
    {L('address', 'Adresse', 'street-address')}{L('city', 'Ville', 'address-level2')}{L('state', 'Région / État / Département', 'address-level1')}{L('zipCode', 'Code postal', 'postal-code')}
    <Err m={e} /><button className="btn p" disabled={b || !ok}>{b ? 'Création…' : 'Continuer'}</button></form>;
}
export default function Cards() {
  const d = useData('/api/cards'), pr = useData('/api/cards/products'); const [m, setM] = useState<any>(null); const reload = d.reload;
  const timer = useRef<any>(null); useEffect(() => { timer.current = setInterval(() => { if (!document.hidden) reload(); }, 30000); return () => clearInterval(timer.current); }, [reload]);
  const h = d.data?.holder; const products = pr.data?.products ?? []; const prod = (code: string) => products.find((p: any) => p.code === code);
  const close = useCallback(() => setM(null), []);
  if (d.error && !d.data) return <><PageHead title="Cartes virtuelles" /><p className="err" role="alert">{d.error}</p></>;
  return <>
    <PageHead title="Cartes virtuelles" sub="Payez en ligne avec une carte rechargée depuis votre solde ou en USDT.">{h?.registered && <button className="btn p" onClick={() => setM({ t: 'issue' })} disabled={d.data?.maintenance || !products.length}><Plus size={16} /> Nouvelle carte</button>}</PageHead>
    {d.data?.maintenance && <p className="err" role="status">Création et recharge de cartes en maintenance. Vos cartes existantes restent utilisables.</p>}
    {d.data && !h?.registered && <Onboard onDone={reload} />}
    {h?.registered && <>
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}><span>Crédit cartes <b>{usd(d.data?.credit)}</b> · solde Coinvera <b>{usd(d.data?.balance)}</b><br /><small className="mut">Les frais d’émission et de recharge sont affichés avant chaque paiement. Le crédit cartes est dépensé en premier.</small></span><button className="btn" onClick={() => setM({ t: 'deposit' })}>Recharger mon crédit cartes</button></div>
      {d.data.cards.length ? <div className="g2">{d.data.cards.map((c: any) => <button key={c.id} className="card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setM({ t: 'card', c })}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><CreditCard size={22} /><span className={'badge ' + (c.status === 'active' ? 'ok' : 'info')}>{ST[c.status] ?? c.status}{c.closing ? ' (fermeture)' : ''}</span></div>
        <h3 style={{ margin: '12px 0 2px' }}>•••• {c.last4 ?? '····'}</h3><p className="mut" style={{ margin: 0 }}>{c.nameOnCard ?? 'Carte virtuelle'}</p>
        <p style={{ margin: '8px 0 0' }}><b>{c.balance != null ? usd(c.balance) : '—'}</b>{c.otpWaiting ? ' · code en attente' : ''}{c.refundPending && c.status === 'closed' ? (c.advanced ? ' · solde crédité, ajustement à venir' : ' · remboursement en cours') : ''}</p>
        {c.status === 'active' && <span className="btn" role="button" tabIndex={0} style={{ marginTop: 8 }} onClick={ev => { ev.stopPropagation(); setM({ t: 'topup', c }); }} onKeyDown={ev => { if (ev.key === 'Enter') { ev.stopPropagation(); setM({ t: 'topup', c }); } }}>Recharger</span>}</button>)}</div>
        : <Empty title="Aucune carte pour le moment" hint="Créez votre première carte virtuelle en quelques minutes." />}
      <h2>Opérations récentes</h2>
      {d.data.orders.length ? <div className="card stack">{d.data.orders.map((o: any) => <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{o.kind === 'issue' ? 'Nouvelle carte' : 'Recharge'} · {OS[o.status] ?? o.status}{o.status === 'failed' ? ' (remboursée)' : ''}<br /><small className="mut">{o.createdAt ? day(new Date(o.createdAt).toISOString()) : ''}</small></span><b>{usd(o.total)}</b></div>)}</div> : <p className="mut">Aucune opération.</p>}</>}
    {m?.t === 'issue' && <IssuePicker products={products} kyc={h?.kycStatus} onClose={close} onDone={() => { reload(); }} onDeposit={(a: number) => setM({ t: 'deposit', amount: a })} />}
    {m?.t === 'topup' && <Checkout kind="topup" card={m.c} minAmount={prod(m.c.productCode)?.rechargeMin ?? 5} onClose={close} onDone={reload} onDeposit={(a: number) => setM({ t: 'deposit', amount: a })} />}
    {m?.t === 'deposit' && <Deposit amount={m.amount} onClose={close} onDone={reload} />}
    {m?.t === 'card' && <CardModal c={m.c} onClose={close} onChange={reload} />}
  </>;
}
function IssuePicker({ products, kyc, onClose, onDone, onDeposit }: any) {
  const [p, setP] = useState<any>(products.length === 1 ? products[0] : null);
  if (p) return <Checkout kind="issue" product={p} kyc={kyc} minAmount={p.minOpening} onClose={onClose} onDone={onDone} onDeposit={onDeposit} />;
  return <Modal title="Choisir une carte" onClose={onClose}><div className="stack">{products.map((x: any) => <button key={x.code} className="card" style={{ textAlign: 'left' }} onClick={() => setP(x)}><b>{x.title}</b> {x.brand ?? ''}<br /><span className="mut">Dès {usd(x.issueTotalAtMin)} (frais inclus){x.requiresKyc ? ' · vérification d’identité requise' : ''}</span></button>)}</div></Modal>;
}
