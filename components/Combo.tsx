'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
// Liste déroulante avec barre de recherche : le filtrage est instantané (sans accents ni majuscules, à chaque frappe), la liste s'ouvre par-dessus la page (le bouton d'achat reste visible) et se pilote au clavier.
export type Opt = { value: string; label: string; hint?: string; disabled?: boolean };
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export default function Combo({ label, value, onChange, options, placeholder = 'Choisir…', loading, disabled, emptyText = 'Aucun résultat' }: { label: string; value: string; onChange: (v: string) => void; options: Opt[]; placeholder?: string; loading?: boolean; disabled?: boolean; emptyText?: string }) {
  const id = useId(), [open, setOpen] = useState(false), [q, setQ] = useState(''), [act, setAct] = useState(0), box = useRef<HTMLDivElement>(null), list = useRef<HTMLUListElement>(null);
  const shown = useMemo(() => { const n = norm(q); return n ? options.filter(o => norm(o.label).includes(n)) : options; }, [q, options]);
  const sel = options.find(o => o.value === value);
  useEffect(() => { if (!open) return; const f = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f); }, [open]);
  useEffect(() => setAct(0), [q, open]);
  useEffect(() => { (list.current?.children[act] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' }); }, [act]);
  const pick = (o?: Opt) => { if (!o || o.disabled) return; onChange(o.value); setOpen(false); setQ(''); };
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAct(a => Math.min(shown.length - 1, a + 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setAct(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(shown[act]); } else if (e.key === 'Escape') { setOpen(false); }
  };
  return <div className="cb" ref={box}><label htmlFor={id}>{label}</label>
    <button id={id} type="button" className="in cb-btn" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}><span className={sel ? '' : 'mut'}>{sel ? sel.label : loading ? 'Chargement…' : placeholder}</span><ChevronDown size={16} aria-hidden="true" /></button>
    {open && <div className="cb-pan"><div className="cb-s"><Search size={16} aria-hidden="true" /><input autoFocus value={q} onChange={e => setQ(e.target.value)} onKeyDown={key} placeholder="Rechercher…" aria-label={`Rechercher : ${label}`} role="combobox" aria-expanded="true" aria-controls={id + '-l'} /></div>
      <ul id={id + '-l'} className="cb-l" role="listbox" ref={list}>{shown.map((o, i) => <li key={o.value} role="option" aria-selected={o.value === value} aria-disabled={o.disabled} className={'cb-o' + (i === act ? ' on' : '')} onMouseEnter={() => setAct(i)} onMouseDown={e => e.preventDefault()} onClick={() => pick(o)}><span>{o.value === value && <Check size={14} style={{ marginRight: 6, verticalAlign: -2 }} />}{o.label}</span>{o.hint && <small>{o.hint}</small>}</li>)}{!shown.length && <li className="cb-e">{emptyText}</li>}</ul></div>}</div>;
}
