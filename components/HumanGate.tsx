'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { HUMAN_SITEKEY, hasHumanFlag, humanOn, markHumanDisabled } from '@/lib/human-client';
// Vérification « êtes-vous humain » (Cloudflare Turnstile).
//  - S'ouvre automatiquement UNE fois sur la page d'accueil, à la première visite (puis le cookie dure 12 h).
//  - S'ouvre aussi à la demande, quand une action sensible (chat public, contact, mot de passe oublié) en a besoin : voir ensureHuman().
// La protection réelle est côté serveur (requireHuman) : cette fenêtre ne bloque jamais la navigation, les robots d'indexation n'y sont pas soumis.
type Turnstile = { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id?: string) => void; remove: (id?: string) => void };
declare global { interface Window { turnstile?: Turnstile } }
const BOTS = /bot|crawl|spider|slurp|bing|google|yandex|baidu|duckduck|facebookexternalhit|lighthouse|pagespeed|headless|preview/i;
const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<void> | null = null;
const loadScript = () => loading ??= new Promise<void>((ok, ko) => {
  if (window.turnstile) return ok();
  const s = document.createElement('script'); s.src = SRC; s.async = true; s.onload = () => ok(); s.onerror = () => { loading = null; s.remove(); ko(new Error('load')); }; document.head.appendChild(s);
});
export default function HumanGate() {
  const path = usePathname(); const [open, setOpen] = useState(false), [asked, setAsked] = useState(false), [state, setState] = useState<'wait' | 'check' | 'err'>('wait');
  const box = useRef<HTMLDivElement>(null), wid = useRef<string | null>(null), waiters = useRef<((ok: boolean) => void)[]>([]);
  const finish = useCallback((ok: boolean) => { const w = waiters.current; waiters.current = []; w.forEach(f => f(ok)); setOpen(false); setAsked(false); }, []);
  // Ouverture automatique : accueil seulement, première visite, pas pour les robots d'indexation.
  useEffect(() => { if (humanOn() && path === '/' && !hasHumanFlag() && !BOTS.test(navigator.userAgent)) setOpen(true); }, [path]);
  // Ouverture à la demande.
  useEffect(() => {
    const on = (e: Event) => { const d = (e as CustomEvent<{ done: (ok: boolean) => void }>).detail; waiters.current.push(d.done); setAsked(true); setOpen(true); };
    window.addEventListener('cv-human-need', on); return () => window.removeEventListener('cv-human-need', on);
  }, []);
  const verify = useCallback(async (token: string) => {
    setState('check');
    try {
      const r = await fetch('/api/human/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }); const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) { if (j.disabled) markHumanDisabled(); finish(true); return; }
    } catch {}
    setState('err'); if (wid.current) window.turnstile?.reset(wid.current);
  }, [finish]);
  const mount = useCallback(async () => {
    setState('wait');
    try {
      await loadScript(); if (!box.current || !window.turnstile) return;
      if (wid.current) { window.turnstile.remove(wid.current); wid.current = null; }
      wid.current = window.turnstile.render(box.current, { sitekey: HUMAN_SITEKEY, theme: 'auto', language: 'fr', callback: verify, 'error-callback': () => setState('err'), 'expired-callback': () => setState('wait') });
    } catch { setState('err'); }
  }, [verify]);
  useEffect(() => { if (open) mount(); return () => { if (wid.current) { window.turnstile?.remove(wid.current); wid.current = null; } }; }, [open, mount]);
  useEffect(() => { if (!open || !asked) return; const k = (e: KeyboardEvent) => e.key === 'Escape' && finish(false); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [open, asked, finish]);
  if (!open) return null;
  return <div className="hg" role="dialog" aria-modal="true" aria-labelledby="hg-t"><div className="hg-box">
    <div className="hg-ic"><ShieldCheck size={26} aria-hidden="true" /></div>
    <h2 id="hg-t">Vérification de sécurité</h2>
    <p>Confirmez que vous êtes un humain. Cela ne prend que quelques secondes et n’est demandé qu’une fois.</p>
    <div ref={box} className="hg-w" aria-live="polite" />
    {state === 'check' && <p className="mut" role="status">Vérification en cours…</p>}
    {state === 'err' && <div role="alert"><p className="err">La vérification n’a pas abouti (connexion, bloqueur de contenu ou délai dépassé).</p>
      <div className="hg-a"><button type="button" className="btn p" onClick={mount}>Réessayer</button><button type="button" className="btn" onClick={() => finish(false)}>{asked ? 'Annuler' : 'Continuer sans vérifier'}</button></div></div>}
    {!asked && state !== 'err' && <p className="mut hg-n">Protégé par Cloudflare.</p>}
  </div></div>;
}
