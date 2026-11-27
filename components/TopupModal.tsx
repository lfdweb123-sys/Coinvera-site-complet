'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { CopyRow } from '@/components/CopyBtn';
import { api, msg, useData } from '@/lib/client';
import { usd } from '@/components/Bits';
import { Err, Modal } from '@/components/Wizard';
import FiatPay from '@/components/FiatPay';
// Recharge du solde Coinvera : on envoie la crypto à l'adresse de la plateforme (montant exact unique), le crédit arrive après confirmation sur la blockchain.
const DONE = ['confirmed', 'expired'];
export default function TopupModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const cur = useData('/api/topups'); const [a, setA] = useState('50'), [sym, setSym] = useState(''), [c, setC] = useState(''), [o, setO] = useState<any>(null), [e, setE] = useState(''), [busy, setBusy] = useState(false), [qr, setQr] = useState(''), [tx, setTx] = useState(''), [via, setVia] = useState<'crypto' | 'momo'>('crypto'), [stage, setStage] = useState<'choose' | 'pay' | 'done'>('choose'), fm = useData('/api/fiat/methods?scope=balance'); const momo = !!fm.data?.enabled;
  const list: any[] = cur.data?.currencies ?? [], min = cur.data?.min ?? 5, max = cur.data?.max ?? 10000;
  const syms = [...new Set<string>(list.map(x => x.sym))], sel = list.find(x => x.id === c);
  const okAmt = /^\d{1,6}(\.\d{1,2})?$/.test(a) && Number(a) >= min && Number(a) <= max;
  const pick = (s: string) => { const n = list.filter(x => x.sym === s); setSym(s); setC(n.length === 1 ? n[0].id : ''); };
  useEffect(() => { if (o?.address) QRCode.toDataURL(o.address, { margin: 1, width: 180 }).then(setQr).catch(() => {}); }, [o?.address]);
  useEffect(() => { if (!o?.id || DONE.includes(o.status)) return; let stop = false, t: any; const tick = async () => { try { const r = await api(`/api/topups/${o.id}`); if (stop) return; setO(r); if (DONE.includes(r.status)) return; } catch { /* on réessaie */ } t = setTimeout(tick, 12000); }; t = setTimeout(tick, 8000); return () => { stop = true; clearTimeout(t); }; }, [o?.id, o?.status]);
  useEffect(() => { if (o?.status === 'confirmed') onDone(); }, [o?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const create = async () => { setE(''); setBusy(true); try { setO(await api('/api/topups', { method: 'POST', body: JSON.stringify({ cur: c, amount: Number(a).toFixed(2) }) })); } catch (x) { setE(msg(x)); } setBusy(false); };
  const verify = async () => { setE(''); setBusy(true); try { setO(await api(`/api/topups/${o.id}`, { method: 'POST', body: JSON.stringify({ txid: tx.trim() }) })); } catch (x) { setE(msg(x)); } setBusy(false); };
  const started = via === 'momo' && stage !== 'choose';
  return <Modal title="Recharger mon solde" onClose={() => { onClose(); if (via === 'momo' && stage === 'done') onDone(); }} size="md"><div className="stack">{!o ? <>
    <label htmlFor="ta">Montant à créditer (USD)</label><input id="ta" className="in" inputMode="decimal" value={a} disabled={started} onChange={x => setA(x.target.value)} /><p className="mut" style={{ margin: 0 }}>Entre {usd(min * 1e6)} et {usd(max * 1e6)}. Le solde crédité est exactement ce montant.</p>
    {momo && !started && <div className="tabs" role="group" aria-label="Moyen de paiement"><button type="button" className={via === 'crypto' ? 'on' : ''} aria-pressed={via === 'crypto'} onClick={() => setVia('crypto')}>Crypto</button><button type="button" className={via === 'momo' ? 'on' : ''} aria-pressed={via === 'momo'} onClick={() => setVia('momo')}>Mobile Money / virement</button></div>}
    {via === 'momo' && momo ? (okAmt ? <FiatPay scope="balance" amount={a} onDone={onDone} onStage={setStage} /> : <p className="mut" role="status">Saisissez un montant entre {min} et {max} USD pour voir le prix en monnaie locale.</p>) : <>
    <label htmlFor="tk">Crypto</label><select id="tk" className="in" value={sym} onChange={x => pick(x.target.value)}><option value="">Choisir…</option>{syms.map(x => <option key={x} value={x}>{x}</option>)}</select>
    {sym && <><label htmlFor="tn">Réseau</label><select id="tn" className="in" value={c} onChange={x => setC(x.target.value)}><option value="">Choisir…</option>{list.filter(x => x.sym === sym).map(x => <option key={x.id} value={x.id}>{x.net}</option>)}</select></>}
    {sel && <p className="err" role="alert" style={{ margin: 0 }}>{sel.warning}</p>}
    {!cur.loading && !list.length && <p className="err" role="alert">La recharge par crypto n’est pas disponible pour le moment.</p>}
    <Err m={e} /><button className="btn p" disabled={!okAmt || !c || busy} onClick={create}>{busy ? 'Création…' : 'Afficher l’adresse de paiement'}</button></>}</>
    : o.status === 'confirmed' ? <p className="okm" role="status">Paiement reçu : {usd(Number(o.amountUsd) * 1e6)} ont été ajoutés à votre solde.</p>
    : o.status === 'expired' ? <p className="err" role="alert">Cette demande a expiré. Si vous avez déjà envoyé les fonds, ils seront crédités automatiquement dès détection (jusqu’à 7 jours) ; sinon contactez le support avec le hash de la transaction.</p>
    : <><p className="mut" style={{ margin: 0 }}>Envoyez <b>exactement</b> ce montant, sur le réseau indiqué : le montant exact permet d’identifier votre paiement. Valable 60 minutes.</p>
      <CopyRow label={`Montant exact à envoyer (${sel?.sym ?? list.find(x => x.id === o.cur)?.sym ?? ''})`} value={String(o.amount)} /><CopyRow label="Réseau" value={String(o.net)} /><CopyRow label="Adresse de paiement" value={o.address} mono />
      {qr && <img src={qr} alt="QR code de l’adresse de paiement" width={160} height={160} style={{ justifySelf: 'center' }} />}
      {!o.scan && <><label htmlFor="tt">Après l’envoi, collez le hash de la transaction</label><input id="tt" className="in" value={tx} onChange={x => setTx(x.target.value)} /><Err m={e} /><button className="btn p" disabled={tx.trim().length < 8 || busy} onClick={verify}>{busy ? 'Vérification…' : 'Vérifier mon paiement'}</button></>}
      {o.scan && <><Err m={e} /><p className="mut" role="status" style={{ margin: 0 }}>En attente du paiement… (vérification automatique)</p></>}</>}</div></Modal>;
}
