import crypto from 'node:crypto';
// Authentification des tâches planifiées : refuse TOUT si CRON_SECRET n'est pas défini (jamais de « Bearer undefined »), comparaison à temps constant.
export function cronAllowed(req: Request): boolean {
  const s = process.env.CRON_SECRET; if (!s || s.length < 16) return false;
  const a = Buffer.from(req.headers.get('authorization') ?? ''), b = Buffer.from(`Bearer ${s}`);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
