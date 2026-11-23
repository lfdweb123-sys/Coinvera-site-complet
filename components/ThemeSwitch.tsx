'use client';
import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { setTheme, type ThemeChoice } from '@/lib/theme';
const OPTS: [ThemeChoice, string, any][] = [['light', 'Clair', Sun], ['system', 'Système', Monitor], ['dark', 'Sombre', Moon]];
// Sélecteur de thème. `mini` : petites pastilles d'icônes (pied de page) ; sinon boutons avec libellé (paramètres).
export default function ThemeSwitch({ mini }: { mini?: boolean }) {
  const [c, setC] = useState<ThemeChoice>('system');
  useEffect(() => { setC((document.documentElement.getAttribute('data-theme-choice') as ThemeChoice) || 'system'); }, []);
  const pick = (v: ThemeChoice) => { setC(v); setTheme(v); };
  return <div className={mini ? 'theme-mini' : 'theme-sw'} role="group" aria-label="Thème d’affichage">{OPTS.map(([v, l, I]) => <button key={v} type="button" aria-pressed={c === v} aria-label={l} title={l} onClick={() => pick(v)}><I size={mini ? 16 : 17} />{!mini && l}</button>)}</div>;
}
