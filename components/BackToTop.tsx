'use client';
import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
// Bouton « retour en haut » : apparaît après un défilement de 400 px.
export default function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => { const on = () => setShow(window.scrollY > 400); on(); window.addEventListener('scroll', on, { passive: true }); return () => window.removeEventListener('scroll', on); }, []);
  return <button type="button" className={'totop' + (show ? ' show' : '')} aria-label="Retour en haut de la page" title="Retour en haut" tabIndex={show ? 0 : -1} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><ArrowUp size={20} /></button>;
}
