// Limites de requêtes de la documentation 5sim (section « Limits ») :
//   100 requêtes par seconde par adresse IP (erreur HTTP 503), par clé API (429) et pour l'achat de numéros (503) ;
//   si la limite est atteinte 5 fois en 10 minutes : bannissement de 10 minutes.
// Nous restons en dessous (90 requêtes/s) ; si 5sim répond quand même 429/503 cinq fois en 10 minutes, on cesse d'appeler 5sim pendant 10 minutes.
export const PER_SECOND = 90, HITS_TO_BAN = 5, HIT_WINDOW_MS = 10 * 60_000, BAN_MS = 10 * 60_000;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let win: number[] = [], hits: number[] = [], bannedUntil = 0, loadedAt = 0;
export const resetLimits = () => { win = []; hits = []; bannedUntil = 0; loadedAt = 0; };
/** Attend si 90 requêtes sont déjà parties dans la dernière seconde. */
export async function gate() {
  for (;;) { const now = Date.now(); while (win.length && now - win[0] >= 1000) win.shift(); if (win.length < PER_SECOND) { win.push(now); return; } await sleep(1000 - (now - win[0]) + 1); }
}
// Le bannissement est partagé entre les instances du serveur via Firestore (lu au plus toutes les 30 s, écrit au moment du bannissement) ; ignoré en test.
const persist = process.env.VITEST ? null : async () => (await import('../firebase-admin')).db.doc('system/fivesim_limits');
export async function isBanned(now = Date.now()) {
  if (persist && now - loadedAt > 30_000) { loadedAt = now; try { bannedUntil = Math.max(bannedUntil, Number(((await (await persist()!).get()).data() as any)?.bannedUntil) || 0); } catch { /* base indisponible : l'état local suffit */ } }
  return now < bannedUntil;
}
/** À appeler à chaque réponse 429 ou 503 de 5sim. */
export function noteLimitHit(now = Date.now()) {
  hits = hits.filter(t => now - t < HIT_WINDOW_MS); hits.push(now);
  if (hits.length >= HITS_TO_BAN) { bannedUntil = now + BAN_MS; hits = []; if (persist) void persist().then(r => r.set({ bannedUntil }, { merge: true })).catch(() => {}); }
}
export const banState = () => ({ bannedUntil: bannedUntil > Date.now() ? bannedUntil : null, recentHits: hits.length });
