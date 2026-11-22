'use client';
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
// Copie dans le presse-papiers (avec repli pour les navigateurs sans l'API moderne) et confirme visuellement.
async function copy(v: string) {
  try { await navigator.clipboard.writeText(v); return true; } catch { /* repli */ }
  try { const t = document.createElement('textarea'); t.value = v; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); return ok; } catch { return false; }
}
export function CopyBtn({ value, label = 'Copier' }: { value: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return <button type="button" className={'cpy' + (ok ? ' ok' : '')} aria-label={`${label} : ${value}`} onClick={async () => { if (await copy(value)) { setOk(true); setTimeout(() => setOk(false), 1800); } }}>{ok ? <Check size={15} /> : <Copy size={15} />}<span>{ok ? 'Copié' : label}</span></button>;
}
// Ligne « libellé — valeur — Copier » pour les montants et adresses à recopier ailleurs.
export function CopyRow({ label, value, shown, mono }: { label: string; value: string; shown?: string; mono?: boolean }) {
  return <div className="cprow"><div className="cpl">{label}</div><div className="cpv"><span className={mono ? 'mono' : ''}>{shown ?? value}</span><CopyBtn value={value} /></div></div>;
}
