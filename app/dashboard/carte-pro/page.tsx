'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { CopyRow } from '@/components/CopyBtn';
import { ArrowUpRight, CreditCard, Plus, ShieldCheck } from 'lucide-react';
import { api, auth, msg, useData } from '@/lib/client';
import CardArt, { KIND_LABEL, kindOf } from '@/components/CardArt';
import { byId, networkWarning } from '@/lib/cryptos';
import { PageHead, usd, day, Empty } from '@/components/Bits';
import { Err, Modal, Nav, Stepper } from '@/components/Wizard';
import FiatPay from '@/components/FiatPay';
import { CardDrawer, CardsList, money, StatusPill } from '@/components/ProCards';
// Virtuals cards pro : cartes Visa émises via ScarabPay, entièrement séparées des cartes virtuelles (/dashboard/cards). Le nom du prestataire n'apparaît jamais à l'écran.
const ST: Record<string, string> = { pending: 'En création', active: 'Active', frozen: 'Gelée', terminated: 'Fermée', expired: 'Expirée', failed: 'Échouée' };
const OS: Record<string, string> = { reserved: 'En cours', processing: 'En cours', confirmed: 'Terminée', failed: 'Échouée' };
const KYC: Record<string, string> = { unsubmitted: 'Vérification en cours de lancement', review: 'Dossier en cours d’examen', pending: 'Vérification finale en cours', approved: 'Identité vérifiée', rejected: 'Vérification refusée' };
const AMT = /^\d{1,6}(\.\d{1,2})?$/;
const ID_TYPES: [string, string][] = [['passport', 'Passeport'], ['national_id', 'Carte nationale d’identité'], ['drivers_license', 'Permis de conduire'], ['voters_card', 'Carte d’électeur'], ['ghana_card', 'Ghana Card'], ['bvn', 'BVN (Nigeria)'], ['nin', 'NIN (Nigeria)'], ['vnin', 'NIN virtuel (Nigeria)']];
const NO_PHOTO = ['bvn', 'nin'], TWO_SIDES = ['national_id', 'ghana_card', 'drivers_license', 'voters_card'];
const COUNTRIES: [string, string][] = [['BEN', 'Bénin'], ['NGA', 'Nigéria'], ['GHA', 'Ghana'], ['TGO', 'Togo'], ['CIV', 'Côte d’Ivoire'], ['SEN', 'Sénégal'], ['BFA', 'Burkina Faso'], ['MLI', 'Mali'], ['NER', 'Niger'], ['CMR', 'Cameroun'], ['GAB', 'Gabon'], ['COG', 'Congo'], ['COD', 'RD Congo'], ['GIN', 'Guinée'], ['TCD', 'Tchad'], ['FRA', 'France'], ['BEL', 'Belgique'], ['CAN', 'Canada'], ['GBR', 'Royaume-Uni'], ['USA', 'États-Unis']];
const FIELD_LABEL: Record<string, string> = { first_name: 'Prénom', last_name: 'Nom', email: 'E-mail', phone_number: 'Téléphone', dial_code: 'Indicatif', date_of_birth: 'Date de naissance', id_type: 'Type de pièce', id_number: 'Numéro de pièce', line1: 'Adresse', city: 'Ville', state: 'État / région', postal_code: 'Code postal', country: 'Pays', occupation: 'Profession', employment_status: 'Statut professionnel', account_purpose: 'Usage de la carte', annual_salary: 'Revenu annuel', expected_monthly_volume: 'Dépenses mensuelles', id_front_image: 'Photo recto', id_back_image: 'Photo verso', terms_of_service_accepted: 'Conditions' };

// Appel qui conserve le détail par champ des erreurs de validation (api() ne garde que le code).
async function call(path: string, init: RequestInit = {}) {
  const t = await auth.currentUser?.getIdToken();
  const r = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) } }); const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e: any = new Error(j.error || 'error'); e.fields = j.fields; throw e; } return j;
}
// Photo de pièce d'identité : réduite dans le navigateur (JPEG, 1600 px max) pour tenir dans la limite d'envoi de l'hébergeur ; une photo de téléphone pèse plusieurs Mo.
async function shrink(f: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(f.type)) throw new Error('image_format');
  const b = await createImageBitmap(f), k = Math.min(1, 1600 / Math.max(b.width, b.height)), c = document.createElement('canvas'); c.width = Math.round(b.width * k); c.height = Math.round(b.height * k);
  c.getContext('2d')!.drawImage(b, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.82).split(',')[1];
}
const fieldsMsg = (e: any) => e?.fields ? Object.entries(e.fields).map(([k, v]: any) => `${FIELD_LABEL[k] ?? k} : ${v?.[0] === 'underage' ? 'vous devez avoir 18 ans' : 'invalide ou manquant'}`).join(' · ') : '';
function usePoll(url: string | null, done: (d: any) => boolean, every = 5000) {
  const [d, setD] = useState<any>(null);
  useEffect(() => { if (!url) return; let stop = false, t: any; const tick = async () => { try { const r = await api(url); if (stop) return; setD(r); if (done(r)) return; } catch { /* on réessaie */ } t = setTimeout(tick, every); }; tick(); return () => { stop = true; clearTimeout(t); }; }, [url]); // eslint-disable-line react-hooks/exhaustive-deps
  return d;
}

// ---- Vérification d'identité (mode « merchant ») --------------------------------------------------------------------------------
const EMPTY = { first_name: '', last_name: '', email: '', dial_code: '+229', phone_number: '', date_of_birth: '', id_type: 'passport', id_number: '', line1: '', city: '', state: '', postal_code: '', country: 'BEN', place_of_birth: '', occupation: '', employment_status: 'employed', account_purpose: 'personal_spending', annual_salary: '', expected_monthly_volume: '' };
function IdentityForm({ email, fix, onClose, onDone }: { email?: string; fix?: boolean; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState<any>({ ...EMPTY, email: email ?? '' }), [front, setFront] = useState(''), [back, setBack] = useState(''), [terms, setTerms] = useState(false), [e, setE] = useState(''), [busy, setBusy] = useState(false), [st, setSt] = useState(0);
  const set = (k: string) => (x: any) => setV({ ...v, [k]: x.target.value }); const needFront = !NO_PHOTO.includes(v.id_type), needBack = TWO_SIDES.includes(v.id_type);
  const pick = (set_: (s: string) => void) => async (x: React.ChangeEvent<HTMLInputElement>) => { setE(''); const f = x.target.files?.[0]; if (!f) return; try { set_(await shrink(f)); } catch { setE('Utilisez une photo JPEG, PNG ou WebP (pas de PDF).'); } };
  const submit = async () => {
    setE(''); setBusy(true);
    try {
      const body: any = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== ''));
      if (needFront && front) body.id_front_image = front; if (needBack && back) body.id_back_image = back;
      if (!fix) body.terms_of_service_accepted = true;
      await call('/api/scarab/customer', { method: fix ? 'PUT' : 'POST', body: JSON.stringify(body) }); onDone(); onClose();
    } catch (x: any) { setE(fieldsMsg(x) || msg(x)); } setBusy(false);
  };
  const T = (k: string, label: string, p: any = {}) => <div key={k}><label htmlFor={'f' + k}>{label}</label><input id={'f' + k} className="in" value={v[k]} onChange={set(k)} {...p} /></div>;
  const S = (k: string, label: string, opts: [string, string][]) => <div key={k}><label htmlFor={'f' + k}>{label}</label><select id={'f' + k} className="in" value={v[k]} onChange={set(k)}>{opts.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></div>;
  // Validité de chaque étape (en mode « correction », tout est facultatif : on ne renvoie que ce qui change).
  const okStep = [fix || !!(v.first_name && v.last_name && v.email && v.phone_number && v.date_of_birth), fix || !!(v.id_number && (!needFront || front) && (!needBack || back)), fix || !!(v.line1 && v.city && v.state && v.postal_code), fix || !!(v.occupation && v.annual_salary && v.expected_monthly_volume), fix || terms];
  const steps = ['Identité', 'Pièce', 'Adresse', 'Profil', 'Validation'], last = st === steps.length - 1, idLabel = ID_TYPES.find(([a]) => a === v.id_type)?.[1], country = COUNTRIES.find(([a]) => a === v.country)?.[1];
  return <Modal title={fix ? 'Corriger mes informations' : 'Vérifier mon identité'} onClose={onClose}><Stepper steps={steps} cur={st} /><div className="sbody">
    {st === 0 && <><p className="mut" style={{ margin: 0 }}><ShieldCheck size={15} /> Une seule vérification, pour toutes vos cartes. Saisissez vos informations <b>exactement comme sur votre pièce d’identité</b>. {fix ? 'Ne remplissez que ce qui doit être corrigé.' : ''}</p>
      <div className="g2">{T('first_name', 'Prénom', { autoComplete: 'given-name', autoFocus: true })}{T('last_name', 'Nom', { autoComplete: 'family-name' })}</div>{T('email', 'E-mail', { type: 'email', autoComplete: 'email' })}
      <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8 }}>{T('dial_code', 'Indicatif', { placeholder: '+229' })}{T('phone_number', 'Téléphone (sans l’indicatif)', { inputMode: 'numeric', placeholder: '97000000' })}</div>
      <div className="g2">{T('date_of_birth', 'Date de naissance', { type: 'date' })}{T('place_of_birth', 'Lieu de naissance (facultatif)')}</div></>}
    {st === 1 && <><p className="mut" style={{ margin: 0 }}>{fix ? '' : 'Votre numéro de pièce et vos photos sont transmis pour la vérification et ne sont jamais conservés par Coinvera.'}</p>
      <div className="g2">{S('id_type', 'Pièce d’identité', ID_TYPES)}{T('id_number', 'Numéro de la pièce')}</div>
      {needFront && <div><label htmlFor="fimgf">Photo du recto (nette, en entier, non expirée)</label><input id="fimgf" type="file" accept="image/jpeg,image/png,image/webp" onChange={pick(setFront)} />{front && <small className="okm"> ✓ photo prête</small>}</div>}
      {needBack && <div><label htmlFor="fimgb">Photo du verso</label><input id="fimgb" type="file" accept="image/jpeg,image/png,image/webp" onChange={pick(setBack)} />{back && <small className="okm"> ✓ photo prête</small>}</div>}
      {NO_PHOTO.includes(v.id_type) && <p className="mut" style={{ margin: 0 }}>Cette pièce se vérifie dans la base nationale nigériane : le pays doit être « Nigéria ».</p>}<Err m={e} /></>}
    {st === 2 && <>{T('line1', 'Adresse', { autoComplete: 'address-line1', autoFocus: true })}<div className="g2">{T('city', 'Ville', { autoComplete: 'address-level2' })}{T('state', 'État / région (ou ville)', { autoComplete: 'address-level1' })}</div><div className="g2">{T('postal_code', 'Code postal', { autoComplete: 'postal-code' })}{S('country', 'Pays', COUNTRIES)}</div></>}
    {st === 3 && <><div className="g2">{T('occupation', 'Profession', { placeholder: 'ingénieur, commerçant…', autoFocus: true })}{S('employment_status', 'Situation professionnelle', [['employed', 'Salarié'], ['self_employed', 'Indépendant'], ['student', 'Étudiant']])}</div>
      {S('account_purpose', 'Usage de la carte', [['personal_spending', 'Dépenses personnelles'], ['online_shopping', 'Achats en ligne'], ['subscriptions', 'Abonnements']])}
      <div className="g2">{T('annual_salary', 'Revenu annuel (chiffres seulement)', { inputMode: 'numeric' })}{T('expected_monthly_volume', 'Dépenses mensuelles prévues (chiffres seulement)', { inputMode: 'numeric' })}</div></>}
    {st === 4 && <><div className="kv"><div>Nom <b>{`${v.first_name} ${v.last_name}`.trim() || '—'}</b></div><div>E-mail <b>{v.email || '—'}</b></div><div>Téléphone <b>{v.phone_number ? `${v.dial_code} ${v.phone_number}` : '—'}</b></div><div>Pièce <b>{idLabel}{v.id_number ? ` · ${v.id_number}` : ''}</b></div><div>Pays <b>{country}</b></div></div>
      {!fix && <label style={{ display: 'flex', gap: 10, fontWeight: 400, alignItems: 'flex-start' }}><input type="checkbox" checked={terms} onChange={x => setTerms(x.target.checked)} style={{ marginTop: 3, width: 18, height: 18 }} /><span>J’atteste que ces informations sont exactes et j’accepte les conditions d’utilisation de la carte.</span></label>}<Err m={e} /></>}
  </div><Nav onBack={st > 0 ? () => setSt(st - 1) : undefined} onNext={last ? submit : () => { setE(''); setSt(st + 1); }} disabled={!okStep[st]} busy={busy} last={last} next={last ? (busy ? 'Envoi…' : fix ? 'Corriger et relancer la vérification' : 'Envoyer pour vérification') : 'Continuer'} /></Modal>;
}
function Identity({ cust, email, onChange }: { cust: any; email?: string; onChange: () => void }) {
  const [open, setOpen] = useState<'' | 'new' | 'fix'>(''), [e, setE] = useState(''), [busy, setBusy] = useState(false);
  if (!cust?.registered && !cust?.creating) return <div className="card stack" style={{ maxWidth: 560 }}><h2 style={{ margin: 0 }}>Vérifier mon identité</h2><p className="mut">Avant votre première Virtuals cards pro, une vérification d’identité (une seule fois) est obligatoire. Prévoyez votre pièce d’identité et son numéro.</p>
    <button className="btn p" onClick={() => setOpen('new')}>Commencer la vérification</button>{open && <IdentityForm email={email} onClose={() => setOpen('')} onDone={onChange} />}</div>;
  const k = cust.kycStatus;
  return <div className="card stack" style={{ maxWidth: 560 }}><h2 style={{ margin: 0 }}>{KYC[cust.creating ? 'unsubmitted' : k] ?? 'Vérification'}</h2>
    {k === 'rejected' ? <><p className="err">{cust.failureReason ? `Motif : ${cust.failureReason}` : 'Votre dossier a été refusé.'}</p><p className="mut">Corrigez les informations indiquées, puis relancez la vérification.</p><Err m={e} />
      <div className="btns"><button className="btn p" onClick={() => setOpen('fix')}>Corriger mes informations</button>
        <button className="btn" disabled={busy} onClick={async () => { setE(''); setBusy(true); try { await call('/api/scarab/customer', { method: 'PUT', body: '{}' }); onChange(); } catch (x) { setE(msg(x)); } setBusy(false); }}>Relancer sans modifier</button></div></> :
      <p className="mut" role="status">{k === 'approved' ? 'Vous pouvez créer votre Virtuals cards pro.' : 'Vous serez prévenu dès que votre identité est vérifiée. Cela prend de quelques minutes à quelques heures.'}</p>}
    {cust.verificationUrl && k !== 'approved' && <a className="btn p" href={cust.verificationUrl} target="_blank" rel="noopener noreferrer">Terminer la vérification (selfie)</a>}
    {open === 'fix' && <IdentityForm fix email={email} onClose={() => setOpen('')} onDone={onChange} />}</div>;
}

// ---- Paiement ---------------------------------------------------------------------------------------------------------------------------
function Wait({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const o = usePoll(`/api/scarab/orders/${orderId}`, r => r.status === 'confirmed' || r.status === 'failed');
  useEffect(() => { if (o?.status === 'confirmed') onDone(); }, [o?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  if (o?.status === 'confirmed') return <p className="okm">Opération terminée. Votre carte est à jour.</p>;
  if (o?.status === 'failed') return <><Err m={msg({ message: o.error })} /><p className="mut">Les fonds ont été remis sur votre solde ou votre crédit cartes pro.</p></>;
  return <p className="mut" role="status">Opération en cours : la carte est créée ou rechargée en quelques instants. Vous pouvez fermer cette fenêtre, elle apparaîtra dans la liste.</p>;
}
function PayDirect({ spec, onOrder, deposit, onDone, onStage }: { spec: any; onOrder?: (id: string) => void; deposit?: boolean; onDone?: () => void; onStage?: (s: 'choose' | 'pay' | 'done') => void }) {
  const cur = useData('/api/scarab/pay-orders'); const [c, setC] = useState(''), [sym, setSym] = useState(''), [po, setPo] = useState<any>(null), [e, setE] = useState(''), [qr, setQr] = useState('');
  const live = usePoll(po ? `/api/scarab/pay-orders/${po.id}` : null, r => ['fulfilled', 'failed', 'expired'].includes(r.status), 8000); const p = live ?? po;
  useEffect(() => { if (p?.status === 'fulfilled' && p.orderId) onOrder?.(p.orderId); if (p?.status === 'fulfilled' && deposit) onDone?.(); }, [p?.status, p?.orderId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (po) QRCode.toDataURL(po.address, { margin: 1, width: 180 }).then(setQr).catch(() => {}); }, [po?.address]); // eslint-disable-line react-hooks/exhaustive-deps
  const stage = !po ? 'choose' : (['failed', 'expired'].includes(p.status) || (deposit && p.status === 'fulfilled')) ? 'done' : 'pay';
  useEffect(() => { onStage?.(stage); }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = cur.data?.currencies ?? [];
  const syms: string[] = [...new Set<string>(list.map((x: any) => x.sym))], sel = list.find((x: any) => x.id === c);
  const pickSym = (sym: string) => { const nets = list.filter((x: any) => x.sym === sym); setC(nets.length === 1 ? nets[0].id : ''); setSym(sym); };
  if (!po) return <div className="stack"><label htmlFor="pk">Crypto</label>
    <select id="pk" className="in" value={sym} onChange={x => pickSym(x.target.value)}><option value="">Choisir…</option>{syms.map(x => <option key={x} value={x}>{x}</option>)}</select>
    {sym && <><label htmlFor="pc">Réseau</label><select id="pc" className="in" value={c} onChange={x => setC(x.target.value)}><option value="">Choisir…</option>{list.filter((x: any) => x.sym === sym).map((x: any) => <option key={x.id} value={x.id}>{x.net}</option>)}</select></>}
    {sel && <p className="err" role="alert" style={{ margin: 0 }}>{sel.warning}</p>}
    {!cur.loading && !list.length && <p className="err" role="alert">Paiement direct indisponible : {msg({ message: cur.data?.problem ?? 'no_deposit_address' })}{cur.data?.problem && cur.data.problem !== 'no_deposit_address' ? ` (code : ${cur.data.problem})` : ''}</p>}<Err m={e} />
    <button className="btn p" disabled={!c} onClick={async () => { setE(''); try { setPo(await api(deposit ? '/api/scarab/deposits' : '/api/scarab/pay-orders', { method: 'POST', body: JSON.stringify({ ...spec, cur: c }) })); } catch (x) { setE(msg(x)); } }}>Afficher l’adresse de paiement</button></div>;
  if (p.status === 'expired' || p.status === 'closed') return <p className="err">{p.deposit && p.status === 'expired' ? 'Cette demande a expiré. Si vous avez déjà envoyé le montant exact, votre crédit sera ajouté automatiquement dès détection (jusqu’à 7 jours).' : 'Cette demande de paiement a expiré. Si vous avez déjà envoyé des fonds, contactez le support avec l’identifiant de transaction.'}</p>;
  if (p.status === 'failed') return <><Err m={msg({ message: p.error })} /><p className="mut">Votre paiement a été reçu : le montant a été ajouté à votre crédit cartes pro.</p></>;
  if (p.status === 'fulfilled' && deposit) return <p className="okm" role="status">Paiement reçu : {usd(p.amountUsd)} ont été crédités. Vous pouvez maintenant payer votre carte.</p>;
  if (p.status === 'paid' || p.status === 'fulfilled') return <p className="mut" role="status">Paiement reçu. {deposit ? 'Crédit en cours…' : 'Création de l’opération en cours…'}</p>;
  const payCur = byId(p.cur);
  return <div className="stack"><p className="mut" style={{ margin: 0 }}>Envoyez <b>exactement</b> ce montant, sur le réseau indiqué : le montant exact permet d’identifier votre paiement. Valable 60 minutes.</p>
    <CopyRow label={`Montant exact à envoyer (${payCur?.sym ?? 'USDT'})`} value={String(p.amount)} shown={`${p.amount} ${payCur?.sym ?? 'USDT'}`} /><CopyRow label="Réseau" value={String(p.net)} /><CopyRow label="Adresse de paiement" value={p.address} mono />{p.memo && <CopyRow label="Mémo (obligatoire)" value={String(p.memo)} mono />}
    {payCur && <p className="err" role="alert" style={{ margin: 0 }}>{networkWarning(payCur)}</p>}
    {qr && <img src={qr} alt="QR code de l’adresse de paiement" width={160} height={160} style={{ justifySelf: 'center' }} />}<p className="mut" role="status" style={{ margin: 0 }}>En attente du paiement… (vérification automatique)</p></div>;
}
function Deposit({ amount: a0, onClose, onDone }: { amount?: number; onClose: () => void; onDone: () => void }) {
  const [a, setA] = useState(String(a0 && a0 >= 5 ? a0 : 20)), [st, setSt] = useState(0), [stage, setStage] = useState<'choose' | 'pay' | 'done'>('choose'), [via, setVia] = useState<'' | 'crypto' | 'momo'>(''), fm = useData('/api/fiat/methods?scope=scarab'); const momo = !!fm.data?.enabled; const ok = AMT.test(a) && Number(a) >= 5 && Number(a) <= 10000;
  const cur = st === 0 ? 0 : (via === '' && momo) ? 1 : stage === 'choose' ? 1 : stage === 'pay' ? 2 : 3;
  return <Modal title="Déposer pour payer ma carte" onClose={() => { onClose(); onDone(); }}><Stepper steps={['Montant', 'Réseau', 'Paiement', 'Terminé']} cur={cur} /><div className="sbody">
    {st === 0 ? <>
      <p className="mut" style={{ margin: 0 }}>Le dépôt se fait en crypto (USDT, USDC) ou par mobile money / virement bancaire, et sert uniquement à payer vos Virtuals cards pro (émission et recharges). Il n’est pas retirable. Le montant crédité est exactement celui demandé.</p>
      <label htmlFor="da">Montant à créditer (USD, de 5 à 10 000)</label><input id="da" className="in" inputMode="decimal" autoFocus value={a} onChange={x => setA(x.target.value)} onKeyDown={x => x.key === 'Enter' && ok && setSt(1)} />
      {!ok && a !== '' && <p className="err" role="alert">Saisissez un montant entre 5 et 10 000 USD (deux décimales au plus).</p>}</> : <>
      {stage !== 'done' && <div className="kv"><div>Montant à créditer <b>{usd(a)}</b></div></div>}
      {via === '' && momo && stage === 'choose' ? <div className="stack"><p className="mut" style={{ margin: 0 }}>Comment voulez-vous payer ?</p><button type="button" className="btn p" onClick={() => setVia('crypto')}>Crypto (USDT / USDC)</button><button type="button" className="btn" onClick={() => setVia('momo')}>Mobile money / virement bancaire</button></div>
        : via === 'momo' ? <FiatPay scope="scarab" amount={a} onDone={onDone} onStage={setStage} /> : <PayDirect spec={{ amount: Number(a).toFixed(2) }} deposit onDone={onDone} onStage={setStage} />}</>}
  </div>{st === 0 ? <Nav onNext={() => setSt(1)} disabled={!ok} /> : stage === 'choose' ? <Nav onBack={() => via && momo ? setVia('') : setSt(0)} /> : null}</Modal>;
}
function Checkout({ kind, product, card, mode, minAmount, onClose, onDone, onDeposit }: any) {
  const [amount, setAmount] = useState(String(minAmount ?? 5)), [name, setName] = useState(''), [q, setQ] = useState<any>(null), [e, setE] = useState(''), [pay, setPay] = useState(false), [orderId, setOrderId] = useState(''), [busy, setBusy] = useState(false), [st, setSt] = useState(0), [stage, setStage] = useState<'choose' | 'pay' | 'done'>('choose');
  const nameOk = /^[A-Za-z][A-Za-z .'-]{1,49}$/.test(name.trim());
  const spec = { kind, ...(kind === 'issue' ? { productId: product.id, ...(nameOk ? { nameOnCard: name.trim() } : {}) } : { cardId: card.id }), amount };
  const need = kind === 'issue' && mode === 'platform' && !nameOk;
  useEffect(() => { setQ(null); setE(''); if (need || !AMT.test(amount) || orderId) return; const t = setTimeout(async () => { try { setQ(await api('/api/scarab/quote', { method: 'POST', body: JSON.stringify(spec) })); } catch (x) { setE(msg(x)); } }, 450); return () => clearTimeout(t); }, [amount, need, name]); // eslint-disable-line react-hooks/exhaustive-deps
  const keys = ['amount', ...(kind === 'issue' ? ['name'] : []), 'recap', 'pay', 'done'], labels: Record<string, string> = { amount: 'Montant', name: 'Carte', recap: 'Récapitulatif', pay: 'Paiement', done: 'Confirmation' };
  const key = orderId ? 'done' : keys[st], back = () => setSt(n => n - 1), next = () => setSt(n => n + 1);
  const okAmount = AMT.test(amount) && Number(amount) > 0 && (kind !== 'issue' || Number(amount) >= Number(product.minInitial ?? 0));
  return <Modal title={kind === 'issue' ? `Nouvelle ${product.name}` : `Recharger la carte •••• ${card.last4 ?? ''}`} onClose={() => { onClose(); if (orderId) onDone(); }}><Stepper steps={keys.map(k => labels[k])} cur={keys.indexOf(key)} /><div className="sbody">
    {key === 'amount' && <><label htmlFor="am">{kind === 'issue' ? 'Solde d’ouverture' : 'Montant à charger'} (USD){kind === 'issue' && <> — minimum {usd(product.minInitial)}</>}</label>
      <input id="am" className="in" inputMode="decimal" autoFocus value={amount} onChange={x => setAmount(x.target.value)} onKeyDown={x => x.key === 'Enter' && okAmount && next()} />
      {!okAmount && amount !== '' && <p className="err" role="alert">{kind === 'issue' ? `Saisissez un montant d’au moins ${usd(product.minInitial)} (deux décimales au plus).` : 'Saisissez un montant valide (deux décimales au plus).'}</p>}
      {kind === 'topup' && <p className="mut" style={{ margin: 0 }}>Deux recharges d’une même carte doivent être espacées d’environ 2 minutes.</p>}</>}
    {key === 'name' && <><label htmlFor="nm">Nom sur la carte{mode === 'platform' ? '' : ' (facultatif)'}</label><input id="nm" className="in" maxLength={50} autoFocus value={name} onChange={x => setName(x.target.value)} onKeyDown={x => x.key === 'Enter' && (!need || nameOk) && next()} placeholder="JEAN DUPONT" />
      {mode === 'platform' && !nameOk && name !== '' && <p className="err" role="alert">Utilisez des lettres uniquement (2 caractères au moins).</p>}</>}
    {key === 'recap' && (q ? <div className="kv">{kind === 'issue' && <div>Carte <b>{product.name}</b></div>}{kind === 'issue' && nameOk && <div>Nom sur la carte <b>{name.trim().toUpperCase()}</b></div>}<div>Montant sur la carte <b>{usd(q.amount)}</b></div><div>Frais <b>{usd(q.fees)}</b></div><div className="tot">Total à payer <b>{usd(q.total)}</b></div><div className="mut">Votre solde : {usd(q.balance)}</div></div> : e ? <Err m={e} /> : <p className="mut" role="status">Calcul des frais en cours…</p>)}
    {key === 'pay' && (!q ? <p className="mut" role="status">Calcul des frais en cours…</p> : <>
      {!pay && <div className="kv"><div className="tot">Total à payer <b>{usd(q.total)}</b></div></div>}<Err m={e} />
      {!pay && <>{!q.covers && <p role="status" style={{ margin: 0 }}>Votre solde ne couvre pas encore cette carte : il manque <b>{usd(q.missing)}</b>. Déposez ce montant, puis le bouton de paiement s’active.</p>}
        <div className="btns"><button className="btn p" disabled={busy || !q.covers} title={q.covers ? undefined : 'Déposez d’abord le montant manquant'} onClick={async () => { setBusy(true); setE(''); try { setOrderId((await api('/api/scarab/orders', { method: 'POST', body: JSON.stringify(spec) })).id); } catch (x) { setE(msg(x)); } setBusy(false); }}>Payer {usd(q.total)} avec mon solde</button>
          {!q.covers && <button className="btn" onClick={() => onDeposit?.(Math.max(5, Math.ceil(Number(q.missing))))}>Déposer {usd(Math.max(5, Math.ceil(Number(q.missing))))}</button>}
          <button className="btn" onClick={() => setPay(true)}>Ou payer directement en crypto</button></div></>}
          {pay && <PayDirect spec={spec} onOrder={setOrderId} onStage={setStage} />}</>)}
    {key === 'done' && <Wait orderId={orderId} onDone={onDone} />}
  </div>
  {key === 'amount' && <Nav onNext={next} disabled={!okAmount} />}
  {key === 'name' && <Nav onBack={back} onNext={next} disabled={need && !nameOk} next={!need && !name.trim() ? 'Passer' : 'Continuer'} />}
  {key === 'recap' && <Nav onBack={back} onNext={next} next="Continuer vers le paiement" disabled={!q} />}
  {key === 'pay' && (!pay ? <Nav onBack={back} /> : stage === 'choose' ? <Nav onBack={() => setPay(false)} /> : null)}</Modal>;
}

function IssuePicker({ products, mode, spend, onClose, onDone, onDeposit }: any) {
  const ok = (x: any) => spend >= Number(x.issueTotalAtMin ?? 0);   // sans le solde nécessaire, la carte reste visible (tarifs) mais ne peut pas être choisie
  const [p, setP] = useState<any>(products.length === 1 && ok(products[0]) ? products[0] : null);
  if (p) return <Checkout kind="issue" product={p} mode={mode} minAmount={p.minInitial} onClose={onClose} onDone={onDone} onDeposit={onDeposit} />;
  return <Modal title="Choisir une carte" onClose={onClose}><div className="stack">{products.some((x: any) => !ok(x)) && <div className="btns"><button type="button" className="btn p" onClick={() => onDeposit?.(Math.max(5, Math.ceil(Math.min(...products.map((x: any) => Number(x.issueTotalAtMin))) - spend)))}>Déposer pour acheter une carte</button></div>}{products.map((x: any) => <button key={x.id} type="button" className="card pick" disabled={!ok(x)} aria-disabled={!ok(x)} style={ok(x) ? undefined : { opacity: .55, cursor: 'not-allowed' }} onClick={() => ok(x) && setP(x)}><CardArt name={x.name ?? ''} /><span><span className="pk-t"><b style={{ fontSize: 17 }}>{x.name}</b><span className="badge info">{KIND_LABEL[kindOf(x.name ?? '')]}</span></span><span className="mut">{x.description}</span><br /><span className="mut">Dès {usd(x.issueTotalAtMin)} (frais inclus) · recharge : {usd(x.rechargeFeeAt100)} de frais pour 100 $</span><br /><span className="pk-go">{ok(x) ? 'Choisir cette carte →' : `Solde insuffisant : déposez au moins ${usd(Math.max(0, Number(x.issueTotalAtMin) - spend))} pour la choisir`}</span></span></button>)}</div></Modal>;
}
export default function CartePro() {
  const d = useData('/api/scarab'); const [m, setM] = useState<any>(null); const reload = d.reload; const pr = useData('/api/scarab/products');
  const timer = useRef<any>(null); useEffect(() => { timer.current = setInterval(() => { if (!document.hidden) reload(); }, 30000); return () => clearInterval(timer.current); }, [reload]);
  const close = useCallback(() => setM(null), []); const x = d.data; const products = pr.data?.products ?? []; const prod = (id: string) => products.find((p: any) => p.id === id);
  if (d.error && !x) return <><PageHead title="Virtuals cards pro" /><p className="err" role="alert">{d.error}</p></>;
  if (x && !x.enabled) return <><PageHead title="Virtuals cards pro" sub="Cartes Visa Pro rechargeables." /><Empty title="Bientôt disponible" hint="La Virtuals cards pro n’est pas encore ouverte. Revenez bientôt." /></>;
  const spend = x ? Number(x.balance) + Number(x.credit ?? 0) : 0;
  const ready = x && !x.unavailable && (x.mode === 'platform' || x.customer?.kycStatus === 'approved');
  return <>
    <PageHead title="Virtuals cards pro" sub="Cartes Visa rechargeables pour payer en ligne, avec des frais fixes affichés avant chaque paiement."></PageHead>
    {x?.unavailable && <p className="err" role="status">Création et recharge de cartes momentanément indisponibles. Vos cartes existantes restent utilisables.</p>}
    {x && !x.unavailable && x.mode === 'merchant' && x.customer?.kycStatus !== 'approved' && <Identity cust={x.customer} email={x.email} onChange={reload} />}
    {ready && <>
      <section className="cp-sum" aria-label="Solde pour payer vos cartes"><div><span className="cp-lbl">Solde disponible pour payer vos cartes</span><b className="cp-amt">{money(spend)}</b>
        <div className="cp-split"><span>Crédit cartes pro <b>{money(x.credit ?? 0)}</b></span><span>Solde Coinvera <b>{money(x.balance)}</b></span></div></div>
        <div className="cp-btns"><button className="btn w" onClick={() => setM({ t: 'deposit' })}><ArrowUpRight size={16} aria-hidden /> Déposer</button><button className="btn cp-o" onClick={() => setM({ t: 'issue' })} disabled={!products.length}><Plus size={16} aria-hidden /> Nouvelle carte</button></div>
        <p className="cp-note">Consultez les tarifs avec « Nouvelle carte » : le paiement s’active dès que le solde couvre le total (frais inclus).</p></section>
      <div className="cp-h"><h2>Mes cartes</h2></div>
      {x.cards.length ? <CardsList cards={x.cards} onOpen={(c: any) => setM({ t: 'card', c })} />
        : <Empty title="Aucune carte pour le moment" hint="Créez votre première Virtuals cards pro en quelques instants."><button className="btn p" onClick={() => setM({ t: 'issue' })} disabled={!products.length}><Plus size={16} aria-hidden /> Nouvelle carte</button></Empty>}
      <div className="cp-h"><h2>Opérations récentes</h2></div>
      {x.orders.length ? <div className="card cp-ops">{x.orders.map((o: any) => <div key={o.id} className="cp-op"><span className="cp-oi" aria-hidden>{o.kind === 'issue' ? <CreditCard size={18} /> : <ArrowUpRight size={18} />}</span>
        <span><b>{o.kind === 'issue' ? 'Nouvelle carte' : 'Recharge'}</b><br /><small>{o.createdAt ? day(new Date(o.createdAt).toISOString()) : ''}{o.status === 'failed' ? ' · remboursée' : ''}</small></span>
        <span className="cp-oa"><b>{money(o.total)}</b><span className={'pcs ' + (o.status === 'confirmed' ? 'ok' : o.status === 'failed' ? 'bad' : 'warn')}>{OS[o.status] ?? o.status}</span></span></div>)}</div> : <div className="card"><p className="mut" style={{ margin: 0 }}>Aucune opération pour le moment.</p></div>}</>}
    {m?.t === 'issue' && <IssuePicker products={products} mode={x?.mode} spend={spend} onClose={close} onDone={reload} onDeposit={(a: number) => setM({ t: 'deposit', amount: a })} />}
    {m?.t === 'topup' && <Checkout kind="topup" card={m.c} mode={x?.mode} minAmount={prod(m.c.productId)?.minRecharge ?? 5} onClose={close} onDone={reload} onDeposit={(a: number) => setM({ t: 'deposit', amount: a })} />}
    {m?.t === 'deposit' && <Deposit amount={m.amount} onClose={close} onDone={reload} />}
    {m?.t === 'card' && (() => { const fc = x?.cards.find((k: any) => k.id === m.c.id) ?? m.c; return <CardDrawer c={fc} billing={x?.billingAddress} canTopup={spend >= Number(prod(fc.productId)?.minRecharge ?? 5)} onClose={close} onChange={reload} onTopup={(k: any) => setM({ t: 'topup', c: k })} />; })()}
  </>;
}
