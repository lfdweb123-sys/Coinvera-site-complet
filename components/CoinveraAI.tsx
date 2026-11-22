'use client';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, Clock, Maximize2, Minimize2, MessageSquarePlus, Sparkles, Square, Trash2, X } from 'lucide-react';
import { api, auth, msg } from '@/lib/client';
import { useConfirm } from '@/components/Confirm';
type M = { r: 'u' | 'a'; t: string };
type H = { id: string; title: string; updatedAt: number };
const SUGGEST = ['Comment créer une carte virtuelle ?', 'Quels sont les frais de retrait ?', 'Comment connecter mon site avec l’API ?', 'Comment activer la double authentification ?'];
const SIZE_KEY = 'cv_ai_size';
// Rendu Markdown minimal et sûr (aucun HTML injecté) : gras, code, liens http(s), listes à puces ou numérotées.
function inline(s: string, k: string) {
  return s.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g).map((p, i) => {
    if (/^\*\*.+\*\*$/.test(p)) return <strong key={k + i}>{p.slice(2, -2)}</strong>;
    if (/^`.+`$/.test(p)) return <code key={k + i}>{p.slice(1, -1)}</code>;
    const l = p.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/); if (l) return <a key={k + i} href={l[2]} target="_blank" rel="noreferrer noopener">{l[1]}</a>;
    return <Fragment key={k + i}>{p}</Fragment>;
  });
}
function Md({ t }: { t: string }) {
  const out: React.ReactNode[] = []; let list: { ord: boolean; items: string[] } | null = null;
  const flush = () => { if (list) { const L = list; out.push(L.ord ? <ol key={'o' + out.length}>{L.items.map((x, i) => <li key={i}>{inline(x, 'l' + i)}</li>)}</ol> : <ul key={'u' + out.length}>{L.items.map((x, i) => <li key={i}>{inline(x, 'l' + i)}</li>)}</ul>); list = null; } };
  t.split('\n').forEach((line, i) => {
    const b = line.match(/^\s*[-*•]\s+(.*)/), n = line.match(/^\s*\d+[.)]\s+(.*)/);
    if (b || n) { const ord = !!n; if (list && list.ord !== ord) flush(); list = list ?? { ord, items: [] }; list.items.push((b ?? n)![1]); return; }
    flush(); if (line.trim()) out.push(<p key={'p' + i}>{inline(line.replace(/^#{1,4}\s+/, ''), 'p' + i)}</p>);
  }); flush(); return <>{out}</>;
}
const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'À l’instant' : m < 60 ? `Il y a ${m} min` : m < 1440 ? `Il y a ${Math.round(m / 60)} h` : new Date(t).toLocaleDateString('fr-FR'); };
export default function CoinveraAI() {
  const ask = useConfirm(); const [open, setOpen] = useState(false), [big, setBig] = useState(false), [view, setView] = useState<'chat' | 'history'>('chat');
  const [msgs, setMsgs] = useState<M[]>([]), [chatId, setChatId] = useState<string | null>(null), [text, setText] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState(''), [hist, setHist] = useState<H[] | null>(null), [mounted, setMounted] = useState(false);
  const end = useRef<HTMLDivElement>(null), inp = useRef<HTMLTextAreaElement>(null), abort = useRef<AbortController | null>(null);
  useEffect(() => { setMounted(true); try { setBig(localStorage.getItem(SIZE_KEY) === 'l'); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem(SIZE_KEY, big ? 'l' : 'n'); } catch {} }, [big]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs, open, view]);
  useEffect(() => { if (open && view === 'chat') setTimeout(() => inp.current?.focus(), 60); }, [open, view]);
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [open]);
  const loadHist = useCallback(async () => { try { setHist((await api('/api/ai/chats')).items); } catch (e) { setErr(msg(e)); setHist([]); } }, []);
  const fresh = () => { abort.current?.abort(); setMsgs([]); setChatId(null); setErr(''); setView('chat'); setBusy(false); };
  async function openChat(id: string) { try { const d = await api('/api/ai/chats/' + id); setMsgs(d.messages); setChatId(id); setErr(''); setView('chat'); } catch (e) { setErr(msg(e)); } }
  async function delChat(id: string) { if (!(await ask({ title: 'Supprimer cette conversation ?', message: 'Elle sera effacée définitivement de votre historique.', confirmLabel: 'Supprimer', danger: true }))) return; try { await api('/api/ai/chats/' + id, { method: 'DELETE' }); if (id === chatId) fresh(); loadHist(); } catch (e) { setErr(msg(e)); } }
  async function delAll() { if (!(await ask({ title: 'Effacer tout l’historique ?', message: 'Toutes vos conversations avec Coinvera AI seront supprimées définitivement.', confirmLabel: 'Tout effacer', danger: true }))) return; try { await api('/api/ai/chats', { method: 'DELETE' }); fresh(); setHist([]); setView('history'); } catch (e) { setErr(msg(e)); } }
  async function send(q?: string) {
    const m = (q ?? text).trim(); if (!m || busy) return; setErr(''); setText(''); setBusy(true); setMsgs(x => [...x, { r: 'u', t: m }, { r: 'a', t: '' }]);
    const ac = new AbortController(); abort.current = ac;
    try {
      const tok = await auth.currentUser?.getIdToken();
      const r = await fetch('/api/ai/chat', { method: 'POST', signal: ac.signal, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, body: JSON.stringify({ chatId: chatId ?? undefined, message: m }) });
      if (!r.ok || !r.body) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'error'); }
      const id = r.headers.get('X-Chat-Id'); if (id) setChatId(id);
      const rd = r.body.getReader(), dec = new TextDecoder(); let acc = '';
      for (;;) { const { done, value } = await rd.read(); if (done) break; acc += dec.decode(value, { stream: true }); setMsgs(x => { const c = [...x]; c[c.length - 1] = { r: 'a', t: acc }; return c; }); }
      if (!acc.trim()) throw new Error('ai_unavailable');
    } catch (e) { if ((e as Error).name !== 'AbortError') { setMsgs(x => x.length && x[x.length - 1].r === 'a' && !x[x.length - 1].t ? x.slice(0, -1) : x); setErr(msg(e)); } }
    setBusy(false); abort.current = null;
  }
  const launcher = <button className={'ai-btn' + (open ? ' on' : '')} onClick={() => { setOpen(o => !o); }} aria-haspopup="dialog" aria-expanded={open} title="Coinvera AI"><Sparkles size={17} /><span className="ai-btn-t">Coinvera AI</span></button>;
  const panel = open && mounted && createPortal(
    <section className={'ai-panel' + (big ? ' big' : '')} role="dialog" aria-label="Coinvera AI" aria-modal="false">
      <header className="ai-h"><div className="ai-logo"><Sparkles size={18} /></div><div style={{ minWidth: 0 }}><b>Coinvera AI</b><div className="ai-sub">{busy ? 'Rédaction en cours…' : 'Assistant de la plateforme'}</div></div>
        <div className="ai-tools"><button aria-label="Nouvelle conversation" title="Nouvelle conversation" onClick={fresh}><MessageSquarePlus size={17} /></button>
          <button aria-label="Historique" title="Historique" className={view === 'history' ? 'on' : ''} onClick={() => { if (view === 'history') setView('chat'); else { setView('history'); loadHist(); } }}><Clock size={17} /></button>
          <button aria-label={big ? 'Réduire' : 'Agrandir'} title={big ? 'Réduire' : 'Agrandir'} className="ai-zoom" onClick={() => setBig(b => !b)}>{big ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>
          <button aria-label="Fermer" title="Fermer" onClick={() => setOpen(false)}><X size={18} /></button></div></header>
      {view === 'history' ? <div className="ai-body"><div className="ai-hist">{hist == null ? <div className="skel" style={{ height: 52 }} /> : !hist.length ? <p className="mut" style={{ textAlign: 'center', padding: '30px 10px' }}>Aucune conversation pour le moment.</p> : hist.map(h => <div key={h.id} className={'ai-hi' + (h.id === chatId ? ' cur' : '')}><button className="ai-hi-b" onClick={() => openChat(h.id)}><b>{h.title}</b><span>{ago(h.updatedAt)}</span></button><button className="ai-hi-d" aria-label="Supprimer" onClick={() => delChat(h.id)}><Trash2 size={15} /></button></div>)}
        {!!hist?.length && <button className="btn sm d" style={{ margin: '12px auto 0' }} onClick={delAll}>Effacer tout l’historique</button>}</div></div> :
        <div className="ai-body"><div className="ai-msgs">{!msgs.length && <div className="ai-empty"><div className="ai-logo lg"><Sparkles size={26} /></div><h3>Bonjour, comment puis-je vous aider ?</h3><p>Posez-moi vos questions sur vos paiements, retraits, cartes virtuelles, API ou la sécurité de votre compte.</p><div className="ai-sg">{SUGGEST.map(s => <button key={s} onClick={() => send(s)}>{s}</button>)}</div></div>}
          {msgs.map((m, i) => <div key={i} className={'ai-m ' + (m.r === 'u' ? 'u' : 'a')}>{m.r === 'a' && <div className="ai-av"><Sparkles size={13} /></div>}<div className="ai-bub">{m.r === 'u' ? m.t : m.t ? <Md t={m.t} /> : <span className="ai-dots" aria-label="Rédaction"><i /><i /><i /></span>}</div></div>)}
          {err && <div className="err" role="alert" style={{ textAlign: 'center' }}>{err}</div>}<div ref={end} /></div></div>}
      {view === 'chat' && <form className="ai-f" onSubmit={e => { e.preventDefault(); send(); }}><textarea ref={inp} rows={1} value={text} maxLength={2000} placeholder="Écrivez votre question…" aria-label="Votre message" onChange={e => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
        {busy ? <button type="button" className="ai-send stop" aria-label="Arrêter" onClick={() => abort.current?.abort()}><Square size={15} /></button> : <button className="ai-send" aria-label="Envoyer" disabled={!text.trim()}><ArrowUp size={18} /></button>}</form>}
      {view === 'chat' && <div className="ai-foot">Coinvera AI peut se tromper : vérifiez les informations importantes.</div>}
    </section>, document.body);
  return <>{launcher}{panel}</>;
}
