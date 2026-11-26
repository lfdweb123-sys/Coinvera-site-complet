'use client';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';
// Liste déroulante avec barre de recherche : filtrage instantané (sans accents ni majuscules), pilotable au clavier. La liste est affichée hors du flux de la page (portail, position fixe) :
// elle s'ouvre vers le bas ou vers le haut selon la place visible à l'écran, et sur petit écran en feuille ancrée en haut (toujours visible, même avec le clavier ouvert).
export type Opt = { value: string; label: string; hint?: string; disabled?: boolean };
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export default function Combo({ label, value, onChange, options, placeholder = 'Choisir…', loading, disabled, emptyText = 'Aucun résultat' }: { label: string; value: string; onChange: (v: string) => void; options: Opt[]; placeholder?: string; loading?: boolean; disabled?: boolean; emptyText?: string }) {
  const id = useId(), [open, setOpen] = useState(false), [q, setQ] = useState(''), [act, setAct] = useState(0), box = useRef<HTMLDivElement>(null), pan = useRef<HTMLDivElement>(null), btn = useRef<HTMLButtonElement>(null), list = useRef<HTMLUListElement>(null), [pos, setPos] = useState<React.CSSProperties | null>(null), [sheet, setSheet] = useState(false);
  const shown = useMemo(() => { const n = norm(q); return n ? options.filter(o => norm(o.label).includes(n)) : options; }, [q, options]);
  const sel = options.find(o => o.value === value);
  useEffect(() => { if (!open) return; const f = (e: MouseEvent) => { const t = e.target as Node; if (!box.current?.contains(t) && !pan.current?.contains(t)) setOpen(false); }; document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f); }, [open]);
  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect(); if (!r) return; const vh = window.visualViewport?.height ?? window.innerHeight, vw = window.innerWidth;
    if (vw < 640) { setSheet(true); setPos({ left: 12, right: 12, top: 12, maxHeight: Math.max(220, vh - 24) }); return; }
    setSheet(false); const below = vh - r.bottom - 12, above = r.top - 12, up = below < 280 && above > below, room = Math.min(360, Math.max(180, up ? above : below)), w = Math.min(Math.max(r.width, 260), vw - 16);
    setPos({ left: Math.max(8, Math.min(r.left, vw - w - 8)), width: w, maxHeight: room, ...(up ? { bottom: vh - r.top + 6 } : { top: r.bottom + 6 }) });
  }, []);
  useLayoutEffect(() => { if (!open) { setPos(null); return; } place(); const f = () => place(); window.addEventListener('resize', f); window.addEventListener('scroll', f, true); window.visualViewport?.addEventListener('resize', f); return () => { window.removeEventListener('resize', f); window.removeEventListener('scroll', f, true); window.visualViewport?.removeEventListener('resize', f); }; }, [open, place]);
  useEffect(() => { if (!open || !sheet) return; const o = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = o; }; }, [open, sheet]);
  useEffect(() => setAct(0), [q, open]);
  useEffect(() => { (list.current?.children[act] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' }); }, [act]);
  const pick = (o?: Opt) => { if (!o || o.disabled) return; onChange(o.value); setOpen(false); setQ(''); };
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAct(a => Math.min(shown.length - 1, a + 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setAct(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(shown[act]); } else if (e.key === 'Escape') { setOpen(false); }
  };
  return <div className="cb" ref={box}><label htmlFor={id}>{label}</label>
    <button ref={btn} id={id} type="button" className="in cb-btn" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}><span className={sel ? '' : 'mut'}>{sel ? sel.label : loading ? 'Chargement…' : placeholder}</span><ChevronDown size={16} aria-hidden="true" /></button>
    {open && pos && createPortal(<>{sheet && <div className="cb-back" onMouseDown={() => setOpen(false)} aria-hidden="true" />}<div className={"cb-pan" + (sheet ? " sheet" : "")} style={pos} ref={pan}><div className="cb-s"><Search size={16} aria-hidden="true" /><input autoFocus value={q} onChange={e => setQ(e.target.value)} onKeyDown={key} placeholder="Rechercher…" enterKeyHint="search" aria-label={`Rechercher : ${label}`} role="combobox" aria-expanded="true" aria-controls={id + '-l'} /></div>
      <ul id={id + '-l'} className="cb-l" role="listbox" ref={list}>{shown.map((o, i) => <li key={o.value} role="option" aria-selected={o.value === value} aria-disabled={o.disabled} className={'cb-o' + (i === act ? ' on' : '')} onMouseEnter={() => setAct(i)} onMouseDown={e => e.preventDefault()} onClick={() => pick(o)}><span>{o.value === value && <Check size={14} style={{ marginRight: 6, verticalAlign: -2 }} />}{o.label}</span>{o.hint && <small>{o.hint}</small>}</li>)}{!shown.length && <li className="cb-e">{emptyText}</li>}</ul></div></>, document.body)}</div>;
}
