'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Check, ChevronDown, ChevronUp, CircleCheck, Clock, Copy, Eye, EyeOff, EllipsisVertical, KeyRound, Search, Send, Snowflake, SlidersHorizontal, X, XCircle } from 'lucide-react';
import { api, msg, useData } from '@/lib/client';
import { Err } from '@/components/Wizard';
import ProCard from '@/components/ProCard';
// Liste des Virtuals cards pro (tableau) et panneau latéral d'une carte. Les montants viennent de /api/scarab ; numéro et code ne sont lus qu'à la demande et jamais stockés.
// Montants en dollars américains, format français sans le suffixe « US » (ex. 5,00 $).
const usd = (v?: string | number | null) => v == null || v === '' || isNaN(Number(v)) ? '—' : Number(v).toLocaleString('fr-FR', { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol' });
type Status = { label: string; cls: string; Icon: any };
const ST: Record<string, Status> = { active: { label: 'Active', cls: 'ok', Icon: CircleCheck }, frozen: { label: 'Gelée', cls: 'frz', Icon: Snowflake }, pending: { label: 'En création', cls: 'warn', Icon: Clock }, terminated: { label: 'Fermée', cls: 'off', Icon: XCircle }, expired: { label: 'Expirée', cls: 'off', Icon: Clock }, failed: { label: 'Échouée', cls: 'bad', Icon: XCircle } };
const AV = ['#0E6F8A', '#2255E8', '#7C3AED', '#B45309', '#0E9F6E', '#BE185D'];
const initials = (n?: string | null) => (n ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'C';
const hue = (s: string) => AV[[...s].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AV.length];
const fdate = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const typeOf = (c: any) => c.productName || 'Virtuals cards pro';
// Nom du vrai titulaire (nom imprimé sur la carte, sinon nom complet du titulaire vérifié) ; le type de carte n'est qu'un repli.
const who = (c: any): string => c.holderName || c.nameOnCard || typeOf(c);
export const money = usd;
export const StatusPill = ({ s }: { s: string }) => { const u = ST[s] ?? { label: s, cls: 'off', Icon: Clock }; return <span className={'pcs ' + u.cls}><u.Icon size={15} aria-hidden /> {u.label}</span>; };

export function CardsList({ cards, onOpen }: { cards: any[]; onOpen: (c: any) => void }) {
  const [q, setQ] = useState(''), [st, setSt] = useState(''), [per, setPer] = useState('all');
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase(), now = Date.now(), from = per === 'month' ? Date.parse(new Date().toISOString().slice(0, 7) + '-01T00:00:00Z') : per === '30' ? now - 30 * 864e5 : per === '90' ? now - 90 * 864e5 : 0;
    return cards.filter(c => (!st || c.status === st) && (!from || Date.parse(c.issuedAt ?? '') >= from) && (!needle || `${who(c)} ${c.last4 ?? ''} ${typeOf(c)}`.toLowerCase().includes(needle)));
  }, [cards, q, st, per]);
  const plural = (n: number) => `${n} carte${n > 1 ? 's' : ''}`;
  return <section className="pc-box" aria-label="Liste des cartes"><div className="pc-bar"><span className="pc-count">{plural(cards.length)}</span>
    <div className="pc-tools"><label className="pc-search"><Search size={18} aria-hidden /><input type="search" placeholder="Rechercher un nom ou un numéro" aria-label="Rechercher une carte" value={q} onChange={e => setQ(e.target.value)} /></label>
      <label className="pc-sel"><SlidersHorizontal size={18} aria-hidden /><select aria-label="Filtrer par statut" value={st} onChange={e => setSt(e.target.value)}><option value="">Filtres : tous les statuts</option>{Object.entries(ST).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select><ChevronDown size={16} aria-hidden /></label>
      <label className="pc-sel"><Calendar size={18} aria-hidden /><select aria-label="Filtrer par période" value={per} onChange={e => setPer(e.target.value)}><option value="all">Toute la période</option><option value="month">Ce mois-ci</option><option value="30">30 derniers jours</option><option value="90">90 derniers jours</option></select><ChevronDown size={16} aria-hidden /></label></div></div>
    <div className="pc-scroll"><table className="pc-t"><thead><tr><th>Titulaire</th><th>Type de carte</th><th>Date d’émission</th><th>Recharges ce mois-ci</th><th>Dépenses ce mois-ci</th><th>Solde de la carte</th><th>Statut</th><th><span className="sr">Actions</span></th></tr></thead>
      <tbody>{rows.map(c => <tr key={c.id} tabIndex={0} aria-label={`Ouvrir la carte de ${who(c)} se terminant par ${c.last4 ?? ''}`} onClick={() => onOpen(c)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(c); } }}>
        <td><div className="pc-who"><span className="pc-av" style={{ background: hue(c.id) }} aria-hidden>{initials(who(c))}</span><span><b>{who(c)}</b><small>****{c.last4 ?? '····'}</small></span></div></td>
        <td data-label="Type de carte">{typeOf(c)}</td><td data-label="Date d’émission">{fdate(c.issuedAt)}</td><td data-label="Recharges ce mois-ci">{usd(c.topupMonth ?? 0)}</td><td data-label="Dépenses ce mois-ci">{c.spentMonth != null ? usd(c.spentMonth) : '—'}</td><td data-label="Solde de la carte"><b>{c.balance != null ? usd(c.balance) : '—'}</b></td>
        <td data-label="Statut"><StatusPill s={c.status} />{c.terminating ? <small className="mut"> (fermeture)</small> : null}</td>
        <td><button type="button" className="pc-dots" aria-label="Ouvrir la carte" onClick={e => { e.stopPropagation(); onOpen(c); }}><EllipsisVertical size={20} aria-hidden /></button></td></tr>)}</tbody></table>
      {!rows.length && <p className="pc-none" role="status">Aucune carte ne correspond à votre recherche.</p>}</div>
    <div className="pc-foot">Affichage de {plural(rows.length)}</div></section>;
}

export function Sec({ title, children, open: o = true }: { title: string; children: React.ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(o);
  return <section className="dw-sec"><button type="button" className="dw-sh" aria-expanded={open} onClick={() => setOpen(!open)}><h3>{title}</h3>{open ? <ChevronUp size={20} aria-hidden /> : <ChevronDown size={20} aria-hidden />}</button>{open && <div>{children}</div>}</section>;
}
function Ops({ id }: { id: string }) {
  const tx = useData(`/api/scarab/cards/${id}/transactions`);
  return tx.data?.transactions?.length ? <div className="dw-ops">{tx.data.transactions.map((t: any) => <div key={t.id}><span>{t.type}{t.merchant ? ` · ${t.merchant}` : ''}<br /><small className="mut">{t.at ? new Date(t.at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : ''}{t.status === 'declined' ? ` · refusée${t.reason ? ` (${t.reason})` : ''}` : t.status === 'pending' ? ' · en cours' : ''}</small></span><b>{t.direction === 'in' ? '+' : ''}{usd(t.amount)}</b></div>)}</div> : <p className="mut" role="status">{tx.loading ? 'Chargement…' : 'Aucune opération.'}</p>;
}

export function CardDrawer({ c, canTopup, billing, onClose, onChange, onTopup }: { c: any; canTopup: boolean; billing?: string; onClose: () => void; onChange: () => void; onTopup: (c: any) => void }) {
  const det = useData(`/api/scarab/cards/${c.id}`); const d = { ...c, ...(det.data?.card ?? {}) };
  const [shown, setShown] = useState<any>(null), [e, setE] = useState(''), [otp, setOtp] = useState<any>(null), [busy, setBusy] = useState(false), [menu, setMenu] = useState(false), [ops, setOps] = useState(false), [copied, setCopied] = useState('');
  const [wd, setWd] = useState<string | null>(null), [wdMsg, setWdMsg] = useState(''), [term, setTerm] = useState(false), [reason, setReason] = useState('no_longer_needed'), [now, setNow] = useState(Date.now());
  const closeBtn = useRef<HTMLButtonElement>(null), menuRef = useRef<HTMLDivElement>(null);
  const act = (action: string, extra: any = {}) => api(`/api/scarab/cards/${c.id}/action`, { method: 'POST', body: JSON.stringify({ action, ...extra }) });
  const run = async (f: () => Promise<any>) => { setE(''); setBusy(true); try { await f(); } catch (x) { setE(msg(x)); } setBusy(false); };
  const live = d.status === 'active' || d.status === 'frozen', frozen = d.status === 'frozen';
  const left = d.issuedAt ? Date.parse(d.issuedAt) + 864e5 - now : 0, canTerm = left <= 0, hh = Math.floor(left / 36e5), mm = Math.max(1, Math.ceil((left % 36e5) / 6e4));
  const copy = (t: string, k: string) => { navigator.clipboard?.writeText(t).then(() => { setCopied(k); setTimeout(() => setCopied(''), 1500); }).catch(() => {}); };
  useEffect(() => { closeBtn.current?.focus(); const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'; const t = setInterval(() => setNow(Date.now()), 30_000); return () => { document.body.style.overflow = prev; clearInterval(t); }; }, []);
  useEffect(() => { const k = (ev: KeyboardEvent) => { if (ev.key !== 'Escape') return; if (menu) setMenu(false); else { setShown(null); setOtp(null); onClose(); } }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [menu, onClose]);
  useEffect(() => { if (!menu) return; const h = (ev: MouseEvent) => { if (!menuRef.current?.contains(ev.target as Node)) setMenu(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, [menu]);
  useEffect(() => { if (!shown || shown.type !== 'details') return; const t = setTimeout(() => setShown(null), 60_000); return () => clearTimeout(t); }, [shown]);   // numéro et code ne restent jamais affichés plus d'une minute
  const close = () => { setShown(null); setOtp(null); onClose(); };
  const addr = (billing ?? '').split('\n').map(l => l.trim()).filter(Boolean);
  const item = (Icon: any, label: string, on: () => void, extra?: { disabled?: boolean; title?: string; dot?: boolean }) => <button type="button" role="menuitem" className="dw-mi" disabled={extra?.disabled} title={extra?.title} onClick={() => { setMenu(false); on(); }}><Icon size={18} aria-hidden /> <span>{label}</span>{extra?.dot && <i className="dw-dot" aria-label="en attente" />}</button>;
  return <div className="dw-ov" onMouseDown={ev => ev.target === ev.currentTarget && close()}><aside className="dw" role="dialog" aria-modal="true" aria-label={`Carte de ${who(d)} se terminant par ${d.last4 ?? ''}`}>
    <div className="dw-top"><StatusPill s={d.status} /><button ref={closeBtn} type="button" className="dw-x" aria-label="Fermer" onClick={close}><X size={22} aria-hidden /></button></div>
    <div><h2 className="dw-title">{who(d)}</h2><p className="mut" style={{ margin: '6px 0 0' }}>{typeOf(d)}{d.last4 ? ` · ****${d.last4}` : ''}</p></div>
    <ProCard product={d.productName} name={who(d) === typeOf(d) ? null : who(d)} last4={d.last4} frozen={frozen} expiry={shown?.type === 'details' ? shown.expiry : d.expiry} pan={shown?.type === 'details' ? shown.pan : null} cvv={shown?.type === 'details' ? shown.cvv : null} />
    {d.status === 'active' && !shown && <button type="button" className="btn p dw-wide dw-reveal" disabled={busy} onClick={() => run(async () => setShown(await act('details')))}><Eye size={18} aria-hidden /> Afficher les informations de la carte</button>}
    {shown?.type === 'details' && <div className="dw-info" role="group" aria-label="Informations de la carte">
      <div className="dw-row"><span>Titulaire</span><b>{(shown.name || who(d)).toUpperCase()}</b></div>
      <div className="dw-row"><span>Numéro de carte</span><span className="dw-id mono">{(String(shown.pan ?? '').replace(/\D/g, '').match(/.{1,4}/g) ?? []).join(' ') || '—'}<button type="button" className="dw-cp" aria-label="Copier le numéro de carte" onClick={() => copy(String(shown.pan ?? '').replace(/\D/g, ''), 'pan')}>{copied === 'pan' ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}</button></span></div>
      <div className="dw-row"><span>Expiration</span><span className="dw-id mono">{shown.expiry ?? d.expiry ?? '—'}<button type="button" className="dw-cp" aria-label="Copier l’expiration" onClick={() => copy(String(shown.expiry ?? d.expiry ?? ''), 'exp')}>{copied === 'exp' ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}</button></span></div>
      <div className="dw-row"><span>Code CVV</span><span className="dw-id mono">{shown.cvv ?? '—'}<button type="button" className="dw-cp" aria-label="Copier le code CVV" onClick={() => copy(String(shown.cvv ?? ''), 'cvv')}>{copied === 'cvv' ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}</button></span></div>
      <div className="dw-row"><button type="button" className="btn sm" onClick={() => setShown(null)}><EyeOff size={15} aria-hidden /> Masquer</button><small className="mut">Masqué automatiquement après 1 minute.</small></div></div>}
    {shown?.type === 'secure_view' && /^https:\/\//.test(shown.url ?? '') && <iframe src={shown.url} title="Détails de la carte" referrerPolicy="no-referrer" allow="clipboard-write" className="dw-sv" />}
    {live ? <div className="dw-act"><button type="button" className="btn p" disabled={!canTopup || frozen || busy} title={!canTopup ? 'Déposez du solde avant de recharger' : frozen ? 'Dégelez la carte pour la recharger' : undefined} onClick={() => onTopup(d)}>Recharger la carte</button>
      <button type="button" className="btn soft" disabled={busy} onClick={() => run(async () => { await act(frozen ? 'unfreeze' : 'freeze'); det.reload(); onChange(); })}>{frozen ? 'Dégeler la carte' : 'Geler la carte'}</button>
      <div className="dw-more" ref={menuRef}><button type="button" className="btn soft dw-ic" aria-label="Plus d’actions" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}><EllipsisVertical size={20} aria-hidden /></button>
        {menu && <div className="dw-menu" role="menu">{d.status === 'active' && (shown ? item(EyeOff, 'Masquer les détails de la carte', () => setShown(null)) : item(Eye, 'Voir les détails de la carte', () => run(async () => setShown(await act('details')))))}
          {item(KeyRound, 'Code de vérification', () => run(async () => setOtp(await act('code'))), { dot: !!d.codeWaiting })}{item(Send, 'Retirer vers mon solde', () => { setWd(''); setWdMsg(''); })}<hr />
          {item(Clock, 'Fermer la carte', () => setTerm(true), { disabled: !canTerm, title: canTerm ? undefined : `Disponible dans ${hh} h ${mm} min` })}</div>}</div></div>
      : <p className="mut" role="status" style={{ textAlign: 'center', margin: 0 }}>{d.status === 'pending' ? 'Votre carte est en cours de création : elle sera disponible dans quelques instants.' : 'Cette carte n’est plus utilisable.'}</p>}
    {live && !canTerm && <div className="dw-note">Une carte ne peut être fermée que 24 heures après sa création. Disponible dans {hh} h {mm} min.</div>}
    {d.declineCount > 0 && <div className="dw-note">{d.declineCount} paiement(s) refusé(s) pour solde insuffisant : à partir du 2ᵉ refus des frais s’appliquent et la carte est fermée au 3ᵉ. Gardez-la approvisionnée.</div>}
    <Err m={e || det.error} />
    {otp && (otp.available ? <div className="dw-note" role="status">Code <b style={{ fontSize: 22, letterSpacing: 2 }}>{otp.code}</b>{otp.merchant ? ` — ${otp.merchant}` : ''}{otp.amount ? ` ${otp.amount} ${otp.currency ?? ''}` : ''}. Valable {Math.max(1, Math.round((otp.expiresInSeconds ?? 0) / 60))} min, affiché une seule fois.{otp.purpose === 'wallet' ? ' (ajout à Apple Pay / Google Pay : choisissez « E-mail » comme mode de réception)' : ''}</div> : <div className="dw-note" role="status">Aucun code en attente.</div>)}
    {wd != null && <div className="dw-panel"><label htmlFor="wda">Montant à retirer vers votre solde (USD)</label><input id="wda" className="in" inputMode="decimal" autoFocus value={wd} onChange={x => setWd(x.target.value)} placeholder="ex. 25" />
      <p className="mut" style={{ margin: 0, fontSize: 13 }}>Minimum 1,00 $ et au moins 1,00 $ doit rester sur la carte{d.balance != null ? <> (maximum {usd(Math.max(0, Number(d.balance) - 1))})</> : null}. Un retrait toutes les 5 minutes par carte. Des frais du prestataire sont déduits : vous recevez le montant net, ajouté à votre solde dès que le réseau carte confirme.</p>
      <div className="btns"><button type="button" className="btn p" disabled={busy || !/^\d{1,6}(\.\d{1,2})?$/.test(wd) || Number(wd) < 1} onClick={() => run(async () => { const r = await act('withdraw', { amount: wd }); setWdMsg(r.status === 'confirmed' ? 'Retrait confirmé.' : 'Retrait demandé : le montant net sera ajouté à votre solde dès confirmation.'); setWd(null); det.reload(); onChange(); })}>Confirmer le retrait</button><button type="button" className="btn" onClick={() => setWd(null)}>Annuler</button></div></div>}
    {wd == null && wdMsg && <div className="dw-note" role="status">{wdMsg}</div>}
    {term && <div className="dw-panel"><p style={{ margin: 0 }}>En fermant la carte, son solde (moins les frais de fermeture) est <b>remboursé sur votre solde Coinvera</b>. Action définitive.</p>
      <label htmlFor="rs">Motif</label><select id="rs" className="in" value={reason} onChange={x => setReason(x.target.value)}><option value="no_longer_needed">Je n’en ai plus besoin</option><option value="lost">Carte perdue</option><option value="stolen">Carte volée</option><option value="fraud">Fraude</option></select>
      <div className="btns"><button type="button" className="btn p" disabled={busy} onClick={() => run(async () => { await act('terminate', { reason }); setTerm(false); det.reload(); onChange(); })}>Fermer définitivement la carte</button><button type="button" className="btn" onClick={() => setTerm(false)}>Annuler</button></div></div>}
    <div className="dw-bal"><span className="mut">Solde de la carte</span><b>{d.balance != null ? usd(d.balance) : '—'}</b></div>
    <div className="dw-stats"><div><span>Recharges ce mois-ci</span><b>{usd(c.topupMonth ?? 0)}</b></div><div><span>Dépenses ce mois-ci</span><b>{c.spentMonth != null ? usd(c.spentMonth) : '—'}</b></div></div>
    <Sec title="Détails de la carte"><div className="dw-row"><span>Identifiant de la carte</span><span className="dw-id">{d.id}<button type="button" className="dw-cp" aria-label="Copier l’identifiant" onClick={() => copy(d.id, 'id')}>{copied === 'id' ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}</button></span></div>
      <div className="dw-row"><span>Numéro de carte</span><b>****{d.last4 ?? '····'}</b></div><div className="dw-row"><span>Expiration</span><b>{d.expiry ?? '—'}</b></div><div className="dw-row"><span>Devise</span><b>USD</b></div><div className="dw-row"><span>Date d’émission</span><b>{fdate(d.issuedAt)}</b></div></Sec>
    {addr.length > 0 && <Sec title="Adresse de facturation"><div className="dw-addr"><address>{addr.map((l, i) => <span key={i}>{l}<br /></span>)}</address><button type="button" className="dw-cp" aria-label="Copier l’adresse de facturation" onClick={() => copy(addr.join(', '), 'addr')}>{copied === 'addr' ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}</button></div><p className="mut" style={{ margin: '10px 0 0', fontSize: 13 }}>Indiquez cette adresse lorsqu’un site vous demande l’adresse de facturation de la carte.</p></Sec>}
    <button type="button" className="btn soft dw-wide" aria-expanded={ops} onClick={() => setOps(!ops)}>{ops ? 'Masquer les opérations' : 'Voir les opérations'}</button>{ops && <Ops id={c.id} />}
  </aside></div>;
}

// ---- Cartes virtuelles standard : même panneau, avec les actions propres à ces cartes (voir, geler, code, fermer) ----
const STD: Record<string, string> = { issuing: 'pending', closed: 'terminated', suspended: 'frozen' };
function OpsStd({ id }: { id: string }) {
  const tx = useData(`/api/cards/${id}/transactions`);
  return tx.data?.transactions?.length ? <div className="dw-ops">{tx.data.transactions.map((t: any) => <div key={t.id}><span>{t.type}{t.merchant ? ` · ${t.merchant}` : ''}<br /><small className="mut">{t.at ? new Date(t.at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : ''}{t.status === 'failed' ? ' · refusée' : t.status === 'processing' ? ' · en cours' : ''}</small></span><b>{t.amount ? usd(t.amount) : '—'}</b></div>)}</div> : <p className="mut" role="status">{tx.loading ? 'Chargement…' : 'Aucune opération.'}</p>;
}
export function StdCardDrawer({ c, canTopup, onClose, onChange, onTopup }: { c: any; canTopup: boolean; onClose: () => void; onChange: () => void; onTopup: (c: any) => void }) {
  const det = useData(`/api/cards/${c.id}`), raw = det.data ?? {}; const d = { ...c, ...raw, status: STD[raw.status ?? c.status] ?? raw.status ?? c.status, balance: raw.balance ?? c.balance };
  const [url, setUrl] = useState(''), [e, setE] = useState(''), [otp, setOtp] = useState<any>(null), [cq, setCq] = useState<any>(null), [busy, setBusy] = useState(false), [menu, setMenu] = useState(false), [ops, setOps] = useState(false), [copied, setCopied] = useState('');
  const closeBtn = useRef<HTMLButtonElement>(null), menuRef = useRef<HTMLDivElement>(null);
  const run = async (f: () => Promise<any>) => { setE(''); setBusy(true); try { await f(); } catch (x) { setE(msg(x)); } setBusy(false); };
  const live = d.status === 'active' || d.status === 'frozen', frozen = d.status === 'frozen', closing = !!c.closing;
  const copy = (t: string, k: string) => { navigator.clipboard?.writeText(t).then(() => { setCopied(k); setTimeout(() => setCopied(''), 1500); }).catch(() => {}); };
  useEffect(() => { closeBtn.current?.focus(); const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = prev; }; }, []);
  useEffect(() => { const k = (ev: KeyboardEvent) => { if (ev.key !== 'Escape') return; if (menu) setMenu(false); else { setUrl(''); setOtp(null); onClose(); } }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [menu, onClose]);
  useEffect(() => { if (!menu) return; const h = (ev: MouseEvent) => { if (!menuRef.current?.contains(ev.target as Node)) setMenu(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, [menu]);
  useEffect(() => { if (!url) return; const t = setTimeout(() => setUrl(''), 60_000); return () => clearTimeout(t); }, [url]);   // la vue sécurisée expire : on la retire au bout d'une minute
  const close = () => { setUrl(''); setOtp(null); onClose(); };
  const item = (Icon: any, label: string, on: () => void, extra?: { disabled?: boolean; title?: string; dot?: boolean }) => <button type="button" role="menuitem" className="dw-mi" disabled={extra?.disabled} title={extra?.title} onClick={() => { setMenu(false); on(); }}><Icon size={18} aria-hidden /> <span>{label}</span>{extra?.dot && <i className="dw-dot" aria-label="en attente" />}</button>;
  return <div className="dw-ov" onMouseDown={ev => ev.target === ev.currentTarget && close()}><aside className="dw" role="dialog" aria-modal="true" aria-label={`Carte ${d.nameOnCard ?? ''} se terminant par ${d.last4 ?? ''}`}>
    <div className="dw-top"><StatusPill s={d.status} /><button ref={closeBtn} type="button" className="dw-x" aria-label="Fermer" onClick={close}><X size={22} aria-hidden /></button></div>
    <div><h2>{d.nameOnCard ?? typeOf(d)}</h2><p className="mut" style={{ margin: '6px 0 0' }}>{typeOf(d)}</p></div>
    <ProCard product={d.productName} name={d.nameOnCard} last4={d.last4} frozen={frozen} expiry={d.expire ?? null} />
    {url && /^https:\/\//.test(url) && <><iframe src={url} title="Détails de la carte" referrerPolicy="no-referrer" allow="clipboard-write" className="dw-sv" /><div className="btns" style={{ justifyContent: 'center' }}><button type="button" className="btn sm" onClick={() => setUrl('')}><EyeOff size={15} aria-hidden /> Masquer</button><small className="mut" style={{ alignSelf: 'center' }}>Masqué automatiquement après 1 minute.</small></div></>}
    {live ? <div className="dw-act"><button type="button" className="btn p" disabled={!canTopup || frozen || closing || busy} title={!canTopup ? 'Rechargez votre crédit cartes avant de recharger' : frozen ? 'Dégelez la carte pour la recharger' : undefined} onClick={() => onTopup(d)}>Recharger la carte</button>
      <button type="button" className="btn soft" disabled={busy || closing} onClick={() => run(async () => { await api(`/api/cards/${c.id}/freeze`, { method: 'POST', body: JSON.stringify({ action: frozen ? 'unfreeze' : 'freeze' }) }); det.reload(); onChange(); })}>{frozen ? 'Dégeler la carte' : 'Geler la carte'}</button>
      <div className="dw-more" ref={menuRef}><button type="button" className="btn soft dw-ic" aria-label="Plus d’actions" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}><EllipsisVertical size={20} aria-hidden /></button>
        {menu && <div className="dw-menu" role="menu">{url ? item(EyeOff, 'Masquer les détails de la carte', () => setUrl('')) : item(Eye, 'Voir les détails de la carte', () => run(async () => { const r = await api(`/api/cards/${c.id}/reveal`, { method: 'POST' }); setUrl(r.revealUrl ?? ''); }))}
          {item(KeyRound, 'Code de vérification', () => run(async () => setOtp(await api(`/api/cards/${c.id}/otp`))), { dot: !!c.otpWaiting })}<hr />
          {item(Clock, 'Fermer la carte', () => run(async () => setCq(await api(`/api/cards/${c.id}/close`))), { disabled: closing, title: closing ? 'Fermeture déjà en cours' : undefined })}</div>}</div></div>
      : <p className="mut" role="status" style={{ textAlign: 'center', margin: 0 }}>{d.status === 'pending' ? 'Votre carte est en cours de création : elle sera disponible dans quelques instants.' : 'Cette carte n’est plus utilisable.'}</p>}
    {closing && <div className="dw-note" role="status">Fermeture en cours{c.refundPending ? ' : le remboursement sera crédité dès confirmation par l’émetteur.' : '.'}</div>}
    <Err m={e || det.error} />
    {otp && (otp.available ? <div className="dw-note" role="status">Code <b style={{ fontSize: 22, letterSpacing: 2 }}>{otp.code}</b>{otp.merchantName ? ` — ${otp.merchantName}` : ''}{otp.amount ? ` ${otp.amount} ${otp.currency ?? ''}` : ''}. Valable {Math.max(1, Math.round((otp.expiresIn ?? 0) / 60))} min, affiché une seule fois.</div> : <div className="dw-note" role="status">Aucun code en attente.</div>)}
    {cq && <div className="dw-panel"><p style={{ margin: 0 }}>En fermant la carte, son solde (<b>{usd(cq.cardBalance)}</b>, moins les frais de fermeture) sera <b>remboursé sur votre compte Coinvera</b> : {usd(cq.refund)} estimés{cq.live ? '' : ' (estimation indisponible pour l’instant)'}. {cq.advance && cq.live ? 'Ce montant est crédité dès que la carte est fermée, puis ajusté au centime près quand l’émetteur confirme le remboursement réel' : 'Le montant est crédité quand l’émetteur confirme le remboursement'} (en général {cq.etaTypical ?? '24 à 48 h'}, jusqu’à {cq.etaMaxDays ?? 45} jours au plus). Action définitive.</p>
      <div className="btns"><button type="button" className="btn p" disabled={busy} onClick={() => run(async () => { await api(`/api/cards/${c.id}/close`, { method: 'POST' }); setCq(null); det.reload(); onChange(); })}>Fermer définitivement la carte</button><button type="button" className="btn" onClick={() => setCq(null)}>Annuler</button></div></div>}
    <div className="dw-bal"><span className="mut">Solde de la carte</span><b>{d.balance != null ? usd(d.balance) : '—'}</b></div>
    <div className="dw-stats"><div><span>Recharges ce mois-ci</span><b>{usd(c.topupMonth ?? 0)}</b></div><div><span>Dépenses ce mois-ci</span><b>{c.spentMonth != null ? usd(c.spentMonth) : '—'}</b></div></div>
    <Sec title="Détails de la carte"><div className="dw-row"><span>Identifiant de la carte</span><span className="dw-id">{d.id}<button type="button" className="dw-cp" aria-label="Copier l’identifiant" onClick={() => copy(d.id, 'id')}>{copied === 'id' ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}</button></span></div>
      <div className="dw-row"><span>Numéro de carte</span><b>****{d.last4 ?? '····'}</b></div><div className="dw-row"><span>Expiration</span><b>{d.expire ?? '—'}</b></div><div className="dw-row"><span>Devise</span><b>USD</b></div><div className="dw-row"><span>Date d’émission</span><b>{fdate(d.issuedAt)}</b></div></Sec>
    <button type="button" className="btn soft dw-wide" aria-expanded={ops} onClick={() => setOps(!ops)}>{ops ? 'Masquer les opérations' : 'Voir les opérations'}</button>{ops && <OpsStd id={c.id} />}
  </aside></div>;
}
