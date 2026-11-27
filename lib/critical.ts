import { createHash } from 'crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from './firebase-admin';
import { alertAdmins } from './admin-alert';
import { warn } from './log';
// Problème critique rencontré par un utilisateur : e-mail automatique à l'administrateur et au support.
// Anti-déluge : un même problème n'envoie qu'un e-mail par fenêtre (30 min), et au plus 20 e-mails par heure au total.
export const CRIT_WINDOW_SEC = 30 * 60;
export const CRIT_HOURLY_CAP = 20;
const clean = (s: unknown, n: number) => String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, n);
// Retire ce qui ressemble à un secret (jeton, clé, e-mail dans une URL) avant d'écrire dans un e-mail.
const redact = (s: string) => s.replace(/(bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi, '$1[masqué]').replace(/\b(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,})/g, '[jeton masqué]').replace(/([?&](?:token|key|secret|code|oobCode|apiKey)=)[^&\s]+/gi, '$1[masqué]');
export type Critical = { kind: 'server' | 'client' | 'payment'; title: string; message?: string; where?: string; user?: string; extra?: [string, string][] };
/** Retourne true si un e-mail a été envoyé (false : doublon, plafond atteint ou erreur). Ne lève jamais d'erreur. */
export async function reportCritical(c: Critical, now = Date.now()): Promise<boolean> {
  try {
    const title = clean(c.title, 120), message = redact(clean(c.message, 600)), where = redact(clean(c.where, 200));
    const sig = createHash('sha256').update([c.kind, title, message.slice(0, 160), where.split('?')[0]].join('|')).digest('hex').slice(0, 20);
    const win = Math.floor(now / (CRIT_WINDOW_SEC * 1000)), hr = Math.floor(now / 3_600_000);
    const same = db.doc(`idempotency_records/crit_${sig}_${win}`), total = db.doc(`idempotency_records/crit_total_${hr}`);
    const ok = await db.runTransaction(async tx => {
      if ((await tx.get(same)).exists) return false;
      const n = ((await tx.get(total)).data()?.n ?? 0) + 1;
      if (n > CRIT_HOURLY_CAP) return false;
      const exp = { expiresAt: now + 2 * 3600_000, ttl: Timestamp.fromMillis(now + 2 * 3600_000) };
      tx.set(same, { sig, ...exp }); tx.set(total, { n, ...exp }); return true;
    });
    if (!ok) { warn('critical.suppressed', { title }); return false; }
    const rows: [string, string][] = [['Type', c.kind === 'client' ? 'Erreur affichée à l’utilisateur (page)' : c.kind === 'payment' ? 'Paiement / solde' : 'Erreur serveur'], ['Quand', new Date(now).toISOString()]];
    if (where) rows.push(['Page / route', where]); if (c.user) rows.push(['Utilisateur', clean(c.user, 120)]);
    if (message) rows.push(['Détail', message]); for (const [k, v] of c.extra ?? []) rows.push([clean(k, 40), redact(clean(v, 300))]);
    await alertAdmins(`[Coinvera] Problème critique : ${title}`, ['Un utilisateur a rencontré un problème critique sur le site. Un même problème n’est signalé qu’une fois toutes les 30 minutes.'], rows);
    return true;
  } catch (e) { warn('critical.error', { message: (e as Error).message }); return false; }
}
