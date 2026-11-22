import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebase-admin';
import { warn } from './log';
// Journal des connexions : UNE ligne par personne et par semaine (id `${uid}_${semaine}`), mise à jour à chaque visite de la semaine.
// L'adresse IP et le lieu viennent des en-têtes de la plateforme d'hébergement (Vercel) ; aucun service tiers n'est appelé.
export const weekOf = (d = new Date()) => { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n); const y = t.getUTCFullYear(); const w = Math.ceil(((+t - +new Date(Date.UTC(y, 0, 1))) / 86400000 + 1) / 7); return `${y}-W${String(w).padStart(2, '0')}`; };
const dec = (v: string | null) => { if (!v) return ''; try { return decodeURIComponent(v); } catch { return v; } };
export function parseUa(ua: string) {
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Autre';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Autre';
  const device = /iPad|Tablet/.test(ua) ? 'Tablette' : /Mobi|iPhone|Android/.test(ua) ? 'Mobile' : 'Ordinateur';
  return { browser, os, device };
}
const PROVIDER: Record<string, string> = { password: 'E-mail et mot de passe', 'google.com': 'Google', 'apple.com': 'Apple', 'github.com': 'GitHub', custom: 'Jeton personnalisé' };
const seen = new Set<string>();   // évite une lecture Firestore à chaque appel sur la même instance
export async function trackConnection(req: Request, u: { uid: string; role: string; email: string; merchant: Record<string, any>; provider?: string }) {
  try {
    const week = weekOf(), id = `${u.uid}_${week}`, ip = (req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '').split(',')[0].trim() || null;
    const key = `${id}|${ip}`; if (seen.has(key)) return; if (seen.size > 5000) seen.clear(); seen.add(key);
    const ua = req.headers.get('user-agent') ?? ''; const ref = db.doc(`connections/${id}`); const s = await ref.get();
    const geo = { city: dec(req.headers.get('x-vercel-ip-city')) || null, country: req.headers.get('x-vercel-ip-country') || null, region: req.headers.get('x-vercel-ip-country-region') || null };
    const base = { ip, ...geo, userAgent: ua.slice(0, 300), ...parseUa(ua), method: PROVIDER[u.provider ?? ''] ?? u.provider ?? 'Inconnue', lastAt: Date.now() };
    if (!s.exists) await ref.set({ uid: u.uid, role: u.role, email: u.email, name: u.merchant.fullName ?? u.merchant.company ?? '', week, ...base, firstAt: Date.now(), hits: 1, ips: ip ? [ip] : [], createdAt: Date.now() });
    else await ref.update({ ...base, hits: FieldValue.increment(1), ...(ip && !(s.data()!.ips ?? []).includes(ip) ? { ips: FieldValue.arrayUnion(ip) } : {}) });
  } catch (e) { warn('connections.track_failed', { message: (e as Error).message }); }
}
