// Thème : Clair / Système / Sombre. Le choix est mémorisé dans un cookie valable pour tout le domaine (www, docs, status, helpcenter…), avec localStorage en secours.
export type ThemeChoice = 'light' | 'system' | 'dark';
export const THEME_KEY = 'cv_theme';
// Exécuté dans <head> AVANT l'affichage (aucun flash blanc) ; suit aussi les changements du thème du système tant que le choix est « Système ».
export const THEME_SCRIPT = `(function(){try{var d=document.documentElement,q=matchMedia('(prefers-color-scheme: dark)');function get(){var m=document.cookie.match(/(?:^|; )${THEME_KEY}=(light|dark|system)/);return m?m[1]:(localStorage.getItem('${THEME_KEY}')||'system')}function apply(){var c=get();d.setAttribute('data-theme-choice',c);d.setAttribute('data-theme',c==='dark'||(c==='system'&&q.matches)?'dark':'light')}apply();q.addEventListener('change',apply);window.__cvTheme=apply}catch(e){}})();`;
export function setTheme(c: ThemeChoice) {
  const h = location.hostname, root = /^[\d.]+$/.test(h) || h === 'localhost' || !h.includes('.') ? '' : '; domain=.' + h.split('.').slice(-2).join('.');
  document.cookie = `${THEME_KEY}=${c}; path=/; max-age=31536000; samesite=lax${root}${location.protocol === 'https:' ? '; secure' : ''}`;
  try { localStorage.setItem(THEME_KEY, c); } catch {}
  (window as any).__cvTheme?.();
}
