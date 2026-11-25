// Côté navigateur : demande la vérification humaine (une fois par 12 h) avant une action sensible.
// Le composant HumanGate (monté dans le layout) écoute l'événement et affiche la fenêtre de vérification.
export const HUMAN_SITEKEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? '';
export const humanOn = () => !!HUMAN_SITEKEY;
export const hasHumanFlag = () => typeof document !== 'undefined' && document.cookie.split('; ').includes('cv_human_ok=1');
let disabledByServer = false;   // clé publique présente mais secret absent côté serveur : rien n'est exigé, on ne redemande pas
export const markHumanDisabled = () => { disabledByServer = true; };
/** Résout true si le visiteur est (ou vient d'être) vérifié, false s'il a fermé la fenêtre. */
export function ensureHuman(): Promise<boolean> {
  if (!humanOn() || disabledByServer || hasHumanFlag()) return Promise.resolve(true);
  return new Promise(done => window.dispatchEvent(new CustomEvent('cv-human-need', { detail: { done } })));
}
