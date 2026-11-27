'use client';
import { useEffect, useState } from 'react';
import { Globe } from 'lucide-react';
import { flagUrl } from '@/lib/esim/format';
// Drapeau rond d'un pays (image) ; globe pour un forfait régional ou mondial, et repli automatique si l'image ne charge pas.
export function Flag({ code, size = 40 }: { code?: string | null; size?: number }) {
  const [bad, setBad] = useState(false), u = flagUrl(code);
  return <span className="es-flag" style={{ width: size, height: size }} aria-hidden>{u && !bad ? <img src={u} alt="" loading="lazy" width={size} height={size} onError={() => setBad(true)} /> : <Globe size={Math.round(size * 0.5)} />}</span>;
}
export function useDebounced<T>(v: T, ms = 300) { const [d, setD] = useState(v); useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]); return d; }
export const usd = (s: string | number | null | undefined) => s == null || s === '' || isNaN(Number(s)) ? '—' : Number(s).toLocaleString('fr-FR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
