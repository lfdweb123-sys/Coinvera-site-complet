'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
declare global { interface Window { turnstile?: { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id?: string) => void; remove: (id?: string) => void }; onTurnstileLoaded?: () => void } }
export default function Verify({ next, siteKey }: { next: string; siteKey: string }) {
  const box = useRef<HTMLDivElement>(null), wid = useRef<string>(''); const [st, setSt] = useState<'load' | 'ready' | 'check' | 'error'>('load'), [msg, setMsg] = useState('');
  const submit = useCallback(async (token: string) => {
    setSt('check'); setMsg('');
    try { const r = await fetch('/api/human', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }); if (!r.ok) throw new Error(String(r.status)); window.location.replace(next); }
    catch { setSt('error'); setMsg('La vérification a échoué. Réessayez.'); window.turnstile?.reset(wid.current); }
  }, [next]);
  useEffect(() => {
    const draw = () => { if (!box.current || !window.turnstile || wid.current) return; wid.current = window.turnstile.render(box.current, { sitekey: siteKey, language: 'fr', theme: 'dark', callback: submit, 'expired-callback': () => window.turnstile?.reset(wid.current), 'error-callback': () => { setSt('error'); setMsg('Impossible de charger la vérification. Vérifiez votre connexion et réessayez.'); } }); setSt('ready'); };
    if (window.turnstile) { draw(); return; }
    window.onTurnstileLoaded = draw;   // script inséré par un script de confiance : autorisé par la politique de sécurité (strict-dynamic)
    const s = document.createElement('script'); s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoaded'; s.async = true; s.onerror = () => { setSt('error'); setMsg('Impossible de joindre le service de vérification. Réessayez dans un instant.'); }; document.head.appendChild(s);
    return () => { if (wid.current) window.turnstile?.remove(wid.current); };
  }, [siteKey, submit]);
  return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, background: '#000', color: '#F5F5F7', ['--ink' as string]: '#F5F5F7', ['--mut' as string]: '#A1A1AA' }}><style>{'html,body{background:#000!important}'}</style><div className="card" style={{ maxWidth: 440, width: '100%', textAlign: 'center', display: 'grid', gap: 14, justifyItems: 'center', background: '#0B0B0F', borderColor: '#26262E', boxShadow: 'none' }}>
    <ShieldCheck size={40} color="var(--brand)" aria-hidden /><h1 style={{ fontSize: 24, margin: 0 }}>Vérification de sécurité</h1>
    <p className="mut" style={{ margin: 0 }}>Nous vérifions que vous êtes bien un humain. Cela ne prend que quelques secondes et n’est demandé qu’une seule fois.</p>
    <div ref={box} style={{ minHeight: 65 }} />
    <p role="status" aria-live="polite" className={st === 'error' ? 'err' : 'mut'} style={{ margin: 0 }}>{st === 'check' ? 'Vérification en cours…' : st === 'load' ? 'Chargement…' : msg}</p>
    {st === 'error' && <button className="btn" onClick={() => window.location.reload()}>Réessayer</button>}
    <noscript><p className="err">JavaScript est nécessaire pour effectuer cette vérification.</p></noscript>
  </div></main>;
}
