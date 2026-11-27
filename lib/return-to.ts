// Retour à la page d'origine après reconnexion. Le chemin demandé est passé dans ?next= (relatif au site, jamais une adresse externe)
// et gardé en sessionStorage le temps de la vérification d'e-mail ; seuls les chemins internes sont acceptés.
const KEY = 'cv_next';
export const safeNext = (v: string | null | undefined): string | null => {
  if (!v || v.length > 500 || !v.startsWith('/') || v.startsWith('//') || v.includes('\\') || /[\u0000-\u001f]/.test(v)) return null;
  if (/^\/(login|register|verify-email|logout)(\/|\?|$)/.test(v)) return null;
  return v;
};
/** URL de connexion qui ramènera à la page courante (côté navigateur). */
export const loginUrl = () => {
  if (typeof window === 'undefined') return '/login';
  const here = safeNext(window.location.pathname + window.location.search);
  return here ? `/login?next=${encodeURIComponent(here)}` : '/login';
};
/** Lit le chemin de retour (?next=, sinon mémorisé), le mémorise pour la suite (vérification d'e-mail) et le renvoie. */
export const readNext = (): string | null => {
  if (typeof window === 'undefined') return null;
  const q = safeNext(new URLSearchParams(window.location.search).get('next'));
  try { if (q) sessionStorage.setItem(KEY, q); return q ?? safeNext(sessionStorage.getItem(KEY)); } catch { return q; }
};
export const clearNext = () => { try { sessionStorage.removeItem(KEY); } catch { /* sans stockage */ } };
/** Destination après connexion : chemin de retour s'il est permis pour ce rôle, sinon la page d'accueil du rôle. */
export const afterLogin = (isAdmin: boolean): string => {
  const n = readNext(); clearNext();
  if (n && (isAdmin || !n.startsWith('/admin'))) return n;
  return isAdmin ? '/admin' : '/dashboard';
};
