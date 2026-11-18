'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
type Opts = { title: string; message?: string; confirmLabel?: string; danger?: boolean };
const Ctx = createContext<(o: Opts) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(Ctx);
// Remplace les boites de dialogue natives (confirm/alert) par une fenetre propre et responsive.
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [o, setO] = useState<(Opts & { res: (b: boolean) => void }) | null>(null);
  const ask = useCallback((opts: Opts) => new Promise<boolean>(res => setO({ ...opts, res })), []);
  const close = useCallback((v: boolean) => { setO(cur => { cur?.res(v); return null; }); }, []);
  useEffect(() => { if (!o) return; const k = (e: KeyboardEvent) => e.key === 'Escape' && close(false); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [o, close]);
  return <Ctx.Provider value={ask}>{children}{o && <div className="modal" role="alertdialog" aria-modal="true" aria-label={o.title} onMouseDown={e => e.target === e.currentTarget && close(false)}><div className="mbox" style={{ maxWidth: 440 }}>
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}><div className="ic" style={{ margin: 0, background: o.danger ? 'var(--badsoft)' : 'var(--brandsoft)', color: o.danger ? 'var(--bad)' : 'var(--brand)' }}><AlertTriangle size={22} /></div>
      <div><h3 style={{ fontSize: 20 }}>{o.title}</h3>{o.message && <p className="mut" style={{ margin: '8px 0 0', fontSize: 15 }}>{o.message}</p>}</div></div>
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24, flexWrap: 'wrap' }}><button className="btn" onClick={() => close(false)}>Annuler</button><button className={'btn ' + (o.danger ? 'dark' : 'p')} style={o.danger ? { background: 'var(--bad)', borderColor: 'var(--bad)' } : undefined} onClick={() => close(true)} autoFocus>{o.confirmLabel ?? 'Confirmer'}</button></div></div></div>}</Ctx.Provider>;
}
