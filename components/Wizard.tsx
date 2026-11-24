'use client';
import { useEffect } from 'react';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
// Briques communes des popups « assistant par étapes » : fenêtre, barre de progression et boutons Retour / Continuer.
export const Modal = ({ title, onClose, children, size = 'wide' }: { title: string; onClose: () => void; children: React.ReactNode; size?: 'md' | 'wide' }) => {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [onClose]);
  return <div className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={e => e.target === e.currentTarget && onClose()}><div className={'mbox' + (size === 'wide' ? ' wide' : '')}><div className="mh"><h2>{title}</h2><button className="mx" aria-label="Fermer" onClick={onClose}><X size={18} /></button></div>{children}</div></div>;
};
export const Stepper = ({ steps, cur }: { steps: string[]; cur: number }) => <ol className="stp" aria-label="Progression">{steps.map((t, i) => <li key={t} className={i < cur ? 'done' : i === cur ? 'on' : ''} aria-current={i === cur ? 'step' : undefined}><span className="dot">{i < cur ? <Check size={14} /> : i + 1}</span><span className="lbl">{t}</span></li>)}</ol>;
export const Nav = ({ onBack, onNext, next = 'Continuer', disabled, busy, last }: { onBack?: () => void; onNext?: () => void; next?: string; disabled?: boolean; busy?: boolean; last?: boolean }) => <div className="sfoot">{onBack ? <button className="btn" onClick={onBack} disabled={busy}><ArrowLeft size={15} /> Retour</button> : <span />}{onNext && <button className="btn p" disabled={disabled || busy} onClick={onNext}>{next}{!last && <ArrowRight size={15} />}</button>}</div>;
export const Err = ({ m }: { m: string }) => m ? <p className="err" role="alert">{m}</p> : null;
