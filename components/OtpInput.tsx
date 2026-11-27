'use client';
import { useEffect, useRef } from 'react';
export default function OtpInput({ value, onChange, onComplete, disabled, invalid }: { value: string; onChange: (v: string) => void; onComplete?: (v: string) => void; disabled?: boolean; invalid?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  // Le curseur arrive tout seul dans la première case à l'affichage, et revient dessus après un code refusé (champ vidé, de nouveau actif).
  useEffect(() => { if (!disabled && !value) refs.current[0]?.focus(); }, [disabled, value === '']); // eslint-disable-line react-hooks/exhaustive-deps
   const d = value.replace(/\D/g, '').slice(0, 6);
  const upd = (v: string) => { const n = v.replace(/\D/g, '').slice(0, 6); onChange(n); if (n.length === 6) onComplete?.(n); };
  return <div className={'otp' + (invalid ? ' bad' : '')} role="group" aria-label="Code à 6 chiffres">{[0, 1, 2, 3, 4, 5].map(i => <input key={i} ref={el => { refs.current[i] = el; }} className="otp-i" inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={6} disabled={disabled} value={d[i] ?? ''} aria-label={`Chiffre ${i + 1}`}
    onFocus={e => e.target.select()}
    onChange={e => { const ch = e.target.value.replace(/\D/g, ''); if (!ch) { upd(d.slice(0, i) + d.slice(i + 1)); return; } if (ch.length > 1) { upd(d.slice(0, i) + ch); refs.current[Math.min(i + ch.length, 5)]?.focus(); } else { upd(d.slice(0, i) + ch + d.slice(i + 1)); refs.current[Math.min(i + 1, 5)]?.focus(); } }}
    onKeyDown={e => { if (e.key === 'Backspace' && !d[i] && i > 0) { refs.current[i - 1]?.focus(); } if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus(); if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus(); }}
    onPaste={e => { e.preventDefault(); upd(e.clipboardData.getData('text')); refs.current[Math.min(e.clipboardData.getData('text').replace(/\D/g, '').length, 5)]?.focus(); }} />)}</div>;
}
