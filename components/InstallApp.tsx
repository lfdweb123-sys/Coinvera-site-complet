'use client';
import { useEffect, useRef, useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
// Boutons d'installation de l'application (PWA) du pied de page.
//  - « Android et ordinateur » : déclenche l'invite native quand le navigateur la propose (Chrome, Edge, Samsung Internet) ; sinon explique comment faire.
//  - « iPhone » : Safari n'a pas d'invite programmable, on affiche donc le pas-à-pas officiel (Partager > Sur l'écran d'accueil).
// Une fois l'application installée (ou ouverte en mode application), les deux boutons disparaissent.
type Prompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
export default function InstallApp() {
  const [ready, setReady] = useState(false), [installed, setInstalled] = useState(false), [dlg, setDlg] = useState<null | 'android' | 'ios'>(null);
  const ev = useRef<Prompt | null>(null);
  useEffect(() => {
    setInstalled(standalone()); setReady(true);
    const onPrompt = (e: Event) => { e.preventDefault(); ev.current = e as Prompt; };
    const onInstalled = () => { ev.current = null; setInstalled(true); setDlg(null); };
    window.addEventListener('beforeinstallprompt', onPrompt); window.addEventListener('appinstalled', onInstalled);
    // Le service worker rend le site installable ; il ne met rien en cache. Sur docs.*, status.* et helpcenter.*, le fichier n'est pas servi : on ne l'enregistre que sur le site principal.
    if ('serviceWorker' in navigator && !/^(docs|status|helpcenter|api)\./i.test(location.hostname)) navigator.serviceWorker.register('/sw.js').catch(() => {});
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); };
  }, []);
  useEffect(() => { if (!dlg) return; const k = (e: KeyboardEvent) => e.key === 'Escape' && setDlg(null); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [dlg]);
  async function android() {
    const p = ev.current; if (!p) { setDlg('android'); return; }
    ev.current = null; await p.prompt(); const r = await p.userChoice.catch(() => null); if (r?.outcome === 'accepted') setInstalled(true);
  }
  if (!ready || installed) return null;
  const steps = dlg === 'ios'
    ? ['Ouvrez coinvera.me dans Safari.', 'Touchez le bouton Partager (le carré avec une flèche vers le haut).', 'Faites défiler puis touchez « Sur l’écran d’accueil ».', 'Touchez « Ajouter » : l’icône Coinvera apparaît sur votre écran.']
    : ['Android (Chrome) : ouvrez le menu ⋮ puis touchez « Installer l’application » ou « Ajouter à l’écran d’accueil ».', 'Ordinateur (Chrome, Edge) : cliquez sur l’icône d’installation à droite de la barre d’adresse, ou sur le menu puis « Installer Coinvera ».', 'Firefox et Safari sur ordinateur n’installent pas encore les applications web : utilisez Chrome ou Edge.'];
  return <><div className="pwa" aria-label="Installer l’application Coinvera">
    <button type="button" className="pwa-b" onClick={android}><Download size={18} aria-hidden="true" /><span>Installer sur Android et ordinateur</span></button>
    <button type="button" className="pwa-b" onClick={() => setDlg('ios')}><Smartphone size={18} aria-hidden="true" /><span>Installer sur iPhone</span></button></div>
    {dlg && <div className="modal" role="dialog" aria-modal="true" aria-label={dlg === 'ios' ? 'Installer sur iPhone' : 'Installer l’application'} onMouseDown={e => e.target === e.currentTarget && setDlg(null)}>
      <div className="mbox" style={{ maxWidth: 440 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}><h3 style={{ fontSize: 20, margin: 0 }}>{dlg === 'ios' ? 'Installer sur iPhone' : 'Installer l’application'}</h3>
        <button type="button" className="btn" aria-label="Fermer" onClick={() => setDlg(null)} style={{ padding: 0, width: 38, minHeight: 38 }}><X size={18} /></button></div>
        <ol style={{ margin: '16px 0 0', paddingLeft: 20, display: 'grid', gap: 10, color: 'var(--ink2)' }}>{steps.map(s => <li key={s}>{s}</li>)}</ol>
        <div style={{ marginTop: 22 }}><button type="button" className="btn p" onClick={() => setDlg(null)} autoFocus>Compris</button></div></div></div>}</>;
}
