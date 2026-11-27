'use client';
import { useEffect, useMemo, useState } from 'react';
import { CopyRow } from '@/components/CopyBtn';
import { api, msg, useData } from '@/lib/client';
import { usd } from '@/components/Bits';
import { Err } from '@/components/Wizard';
// Dépôt par mobile money ou virement bancaire (FeexPay), pour les cartes virtuelles (scope « cards ») et les Virtuals cards pro (scope « scarab »).
// Le montant en monnaie locale est calculé par le serveur ; le crédit est exactement le montant en dollars (= USDT) demandé.
const TERMINAL = ['fulfilled', 'failed', 'expired', 'rejected', 'closed', 'review', 'unknown'];
export default function FiatPay({ scope, amount, onDone, onStage }: { scope: 'cards' | 'scarab' | 'balance'; amount: string; onDone?: () => void; onStage?: (s: 'choose' | 'pay' | 'done') => void }) {
  const meth = useData(`/api/fiat/methods?scope=${scope}`);
  const [cc, setCc] = useState(''), [mid, setMid] = useState(''), [phone, setPhone] = useState(''), [otp, setOtp] = useState(''), [bank, setBank] = useState(''), [e, setE] = useState(''), [busy, setBusy] = useState(false);
  const [q, setQ] = useState<any>(null), [banks, setBanks] = useState<{ code: string; name: string }[]>([]), [po, setPo] = useState<any>(null), [code, setCode] = useState('');
  const list: any[] = meth.data?.methods ?? [], countries = useMemo(() => [...new Map(list.map(m => [m.cc, m.country])).entries()], [list]);
  const m = list.find(x => x.id === mid);
  useEffect(() => { setMid(''); setQ(null); }, [cc]);
  useEffect(() => { setQ(null); setE(''); if (!mid) return; let off = false; api(`/api/fiat/quote?scope=${scope}&method=${mid}&amount=${Number(amount).toFixed(2)}`).then(r => { if (!off) setQ(r); }).catch(x => { if (!off) setE(msg(x)); }); return () => { off = true; }; }, [mid, amount, scope]);
  useEffect(() => { if (m?.flow !== 'bank_redirect') return; api(`/api/fiat/banks?scope=${scope}`).then(r => setBanks(r.banks ?? [])).catch(x => setE(msg(x))); }, [m?.flow, scope]);
  // Suivi de la commande : relecture toutes les 6 s tant qu'elle n'est pas terminée (le webhook et le cron font de même côté serveur).
  useEffect(() => { if (!po?.id || TERMINAL.includes(po.status) || po.status === 'otp') return; let stop = false, t: any; const tick = async () => { try { const r = await api(`/api/fiat/orders/${po.id}`); if (stop) return; setPo(r); if (TERMINAL.includes(r.status)) return; } catch { /* on réessaie */ } t = setTimeout(tick, 6000); }; t = setTimeout(tick, 4000); return () => { stop = true; clearTimeout(t); }; }, [po?.id, po?.status]);
  const stage = !po ? 'choose' : TERMINAL.includes(po.status) ? 'done' : 'pay';
  useEffect(() => { onStage?.(stage); }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (po?.status === 'fulfilled') onDone?.(); }, [po?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async () => { setE(''); setBusy(true); try { setPo(await api('/api/fiat/orders', { method: 'POST', body: JSON.stringify({ scope, method: mid, amount: Number(amount).toFixed(2), ...(m?.phone ? { phone } : {}), ...(m?.flow === 'otp' ? { otp } : {}), ...(m?.flow === 'bank_redirect' ? { bankCode: bank } : {}) }) })); } catch (x) { setE(msg(x)); } setBusy(false); };
  const sendCode = async () => { setE(''); setBusy(true); try { setPo(await api(`/api/fiat/orders/${po.id}`, { method: 'POST', body: JSON.stringify({ otp: code }) })); setCode(''); } catch (x) { setE(msg(x)); } setBusy(false); };

  if (!po) {
    if (meth.loading) return <p className="mut" role="status">Chargement…</p>;
    if (!list.length) return <p className="err" role="alert">Le paiement par mobile money n’est pas disponible pour le moment. Utilisez la crypto.</p>;
    const ready = !!q && (!m?.phone || phone.replace(/\D/g, '').length >= 8) && (m?.flow !== 'otp' || /^\d{4,8}$/.test(otp)) && (m?.flow !== 'bank_redirect' || !!bank);
    return <div className="stack"><label htmlFor="fc">Pays</label>
      <select id="fc" className="in" value={cc} onChange={x => setCc(x.target.value)}><option value="">Choisir…</option>{countries.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
      {cc && <><label htmlFor="fm">Moyen de paiement</label><select id="fm" className="in" value={mid} onChange={x => setMid(x.target.value)}><option value="">Choisir…</option>{list.filter(x => x.cc === cc).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></>}
      {q && <div className="kv"><div>Vous payez <b>{q.localText} {q.label}</b></div><div>Crédit ajouté <b>{usd(q.creditUsd)}</b> <small className="mut">(= {Number(q.usdt).toFixed(2)} USDT)</small></div></div>}
      {m?.phone && <><label htmlFor="fp">Numéro {m.id === 'bmo' ? 'B-MO (format local, ex. 0167399785)' : 'de paiement'}</label><input id="fp" className="in" inputMode="tel" autoComplete="tel" value={phone} onChange={x => setPhone(x.target.value)} placeholder={m.dial && m.id !== 'bmo' ? `+${m.dial} …` : ''} /></>}
      {m?.flow === 'otp' && q && <><p className="mut" style={{ margin: 0 }}>Avant de continuer, composez <b>#144*4*6*{Math.round(q.local)}#</b> sur votre téléphone Orange : vous recevrez un code.</p><label htmlFor="fo">{m.otpLabel}</label><input id="fo" className="in" inputMode="numeric" value={otp} onChange={x => setOtp(x.target.value)} /></>}
      {m?.flow === 'bank_redirect' && <><label htmlFor="fb">Votre banque</label><select id="fb" className="in" value={bank} onChange={x => setBank(x.target.value)}><option value="">Choisir…</option>{banks.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}</select></>}
      <Err m={e} /><button className="btn p" disabled={!ready || busy} onClick={submit}>{busy ? 'Envoi…' : 'Payer'}</button></div>;
  }
  if (po.status === 'fulfilled') return <p className="okm" role="status">Paiement reçu : {usd(po.creditUsd)} ({Number(po.usdt).toFixed(2)} USDT) ont été crédités. {scope === 'balance' ? 'Ils sont disponibles sur votre solde.' : 'Vous pouvez maintenant payer votre carte.'}</p>;
  if (po.status === 'review') return <p className="mut" role="status">Paiement reçu, en cours de vérification par notre équipe. Votre crédit sera ajouté dès validation.</p>;
  if (po.status === 'unknown') return <p className="mut" role="status">Le service de paiement n’a pas répondu. Si vous avez reçu une demande de paiement et validé, votre crédit sera ajouté automatiquement après vérification ; sinon, vous n’avez pas été débité et vous pouvez réessayer.</p>;
  if (po.status === 'failed' || po.status === 'rejected') return <Err m={msg({ message: po.error ?? 'payment_failed' })} />;
  if (po.status === 'expired' || po.status === 'closed') return <p className="err" role="alert">Cette demande a expiré. Si vous avez payé, le crédit sera ajouté automatiquement dès réception : sinon contactez le support avec le numéro utilisé.</p>;
  if (po.status === 'otp') return <div className="stack"><p className="mut" style={{ margin: 0 }}>Un code vous a été envoyé par SMS. Saisissez-le pour confirmer le paiement de <b>{po.localText} {po.label}</b>.</p>
    <label htmlFor="fcode">{list.find(x => x.id === po.method)?.otpLabel ?? 'Code reçu par SMS'}</label><input id="fcode" className="in" inputMode="numeric" autoFocus value={code} onChange={x => setCode(x.target.value)} /><Err m={e} />
    <button className="btn p" disabled={busy || !/^\d{3,8}$/.test(code)} onClick={sendCode}>Confirmer</button></div>;
  return <div className="stack"><p className="mut" style={{ margin: 0 }}>Montant : <b>{po.localText} {po.label}</b> pour {usd(po.creditUsd)} de crédit.</p>
    {po.bank ? <><p className="mut" style={{ margin: 0 }}>Faites un virement depuis l’application de votre banque, au <b>naira près</b> : un autre montant est renvoyé par la banque. Ce compte ne sert qu’une fois.</p>
      <CopyRow label="Montant exact (NGN)" value={String(Math.round(po.local))} shown={`${po.localText} NGN`} /><CopyRow label="Banque" value={po.bank.bankName} /><CopyRow label="Numéro de compte" value={po.bank.number} mono /><CopyRow label="Nom du compte" value={po.bank.name} /></>
      : po.paymentUrl ? <a className="btn p" href={po.paymentUrl} target="_blank" rel="noopener noreferrer">Continuer le paiement</a>
      : <p className="mut" style={{ margin: 0 }}>Validez la demande de paiement qui arrive sur votre téléphone (confirmation par code secret).</p>}
    <p className="mut" role="status" style={{ margin: 0 }}>En attente du paiement… (vérification automatique)</p></div>;
}
