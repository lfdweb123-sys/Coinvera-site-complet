'use client';
import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
// Ligne que l'on balaye vers la gauche OU la droite (mobile) pour la supprimer. Le défilement vertical reste libre ; un balayage trop court ramène la ligne en place.
export default function SwipeRow({ onDelete, children }: { onDelete: () => void; children: React.ReactNode }) {
  const [dx, setDx] = useState(0), [drag, setDrag] = useState(false); const start = useRef<{ x: number; y: number } | null>(null), lock = useRef<'h' | 'v' | null>(null), last = useRef(0);
  const down = (e: React.TouchEvent) => { const t = e.touches[0]; start.current = { x: t.clientX, y: t.clientY }; lock.current = null; };
  const move = (e: React.TouchEvent) => {
    if (!start.current) return; const t = e.touches[0], mx = t.clientX - start.current.x, my = t.clientY - start.current.y;
    if (!lock.current && (Math.abs(mx) > 8 || Math.abs(my) > 8)) lock.current = Math.abs(mx) > Math.abs(my) ? 'h' : 'v';
    if (lock.current === 'h') { setDrag(true); last.current = mx; setDx(mx); }
  };
  const up = () => {
    const d = last.current; start.current = null; setDrag(false); const horiz = lock.current === 'h'; lock.current = null; last.current = 0;
    if (horiz && Math.abs(d) > 90) { setDx(d > 0 ? 420 : -420); setTimeout(onDelete, 180); } else setDx(0);
  };
  return <div style={{ position: 'relative', overflow: 'hidden', touchAction: 'pan-y' }}>
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'var(--bad)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: dx > 0 ? 'flex-start' : 'flex-end', padding: '0 18px', opacity: Math.min(1, Math.abs(dx) / 80) }}><Trash2 size={18} /></div>
    <div onTouchStart={down} onTouchMove={move} onTouchEnd={up} onTouchCancel={up} style={{ position: 'relative', background: 'var(--card, #fff)', transform: `translateX(${dx}px)`, opacity: 1 - Math.min(.6, Math.abs(dx) / 500), transition: drag ? 'none' : 'transform .18s ease, opacity .18s ease' }}>{children}</div></div>;
}
