'use client';
import { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { IDLE_KEY, touchSession } from '@/lib/client';
const LIMIT = 30 * 60_000, WARN = 2 * 60_000;
// Deconnexion automatique apres 30 minutes d'inactivite (synchronisee entre onglets, robuste a la mise en veille).
export default function IdleLogout({ onExpire }: { onExpire: () => void }) {
  const [left, setLeft] = useState<number | null>(null); const warning = useRef(false); const lastWrite = useRef(0);
  useEffect(() => {
    const stored = Number(localStorage.getItem(IDLE_KEY) || 0);
    if (!stored) touchSession(); else if (Date.now() - stored > LIMIT) { onExpire(); return; }
    const mark = () => { if (warning.current) return; const n = Date.now(); if (n - lastWrite.current > 5000) { lastWrite.current = n; touchSession(); } };
    const ev = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const; ev.forEach(e => window.addEventListener(e, mark, { passive: true }));
    const tick = setInterval(() => { const rem = LIMIT - (Date.now() - Number(localStorage.getItem(IDLE_KEY) || Date.now())); if (rem <= 0) { onExpire(); return; } warning.current = rem <= WARN; setLeft(rem <= WARN ? rem : null); }, 1000);
    return () => { ev.forEach(e => window.removeEventListener(e, mark)); clearInterval(tick); };
  }, [onExpire]);
  if (left === null) return null;
  const mm = Math.floor(left / 60000), ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');
  return <div className="modal" role="alertdialog" aria-modal="true" aria-label="Session sur le point d’expirer"><div className="mbox" style={{ maxWidth: 440, textAlign: 'center' }}>
    <div className="ic" style={{ margin: '0 auto 14px', background: 'var(--warnsoft)', color: 'var(--warn)' }}><Clock size={24} /></div><h3 style={{ fontSize: 22 }}>Toujours là ?</h3>
    <p className="mut" style={{ margin: '8px 0 6px', fontSize: 15 }}>Pour votre sécurité, vous allez être déconnecté après 30 minutes d’inactivité.</p><div style={{ font: '800 38px Manrope,Inter,sans-serif', letterSpacing: '-.03em', margin: '10px 0 20px' }}>{mm}:{ss}</div>
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}><button className="btn" onClick={onExpire}>Se déconnecter</button><button className="btn p" autoFocus onClick={() => { warning.current = false; touchSession(); setLeft(null); }}>Rester connecté</button></div></div></div>;
}
