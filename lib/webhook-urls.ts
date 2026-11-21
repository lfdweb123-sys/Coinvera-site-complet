// Liste des URL de webhook d'un marchand. Module sans dépendance serveur : testable seul.
export const MAX_WEBHOOKS = 5;

export function safeUrl(u: string) {   // anti-SSRF basique : https obligatoire, pas d'IP ni de nom interne
  const x = new URL(u);
  if (x.protocol !== 'https:' || /^(localhost|.*\.local|.*\.internal)$/i.test(x.hostname) || /^[\d.]+$/.test(x.hostname) || x.hostname.includes(':')) throw new Error('unsafe_url');
  return x.toString();
}

/** URL configurées. Lit la liste `webhookUrls` ; à défaut l'ancien champ unique `webhookUrl` (comptes créés avant les webhooks multiples). */
export function webhookUrlsOf(s: { webhookUrls?: unknown; webhookUrl?: unknown } | null | undefined): string[] {
  const raw = Array.isArray(s?.webhookUrls) ? s!.webhookUrls : s?.webhookUrl ? [s.webhookUrl] : [];
  const out: string[] = [];
  for (const v of raw) if (typeof v === 'string' && v && !out.includes(v)) out.push(v);
  return out.slice(0, MAX_WEBHOOKS);
}

/** Valide, normalise et dédoublonne une liste saisie. Lève 'unsafe_url' ou 'webhook_limit'. */
export function normalizeUrls(list: string[]): string[] {
  const out: string[] = [];
  for (const u of list) { const s = safeUrl(u); if (!out.includes(s)) out.push(s); }
  if (out.length > MAX_WEBHOOKS) throw new Error('webhook_limit');
  return out;
}

/** Ajoute une URL sans toucher aux autres (idempotent). Lève 'unsafe_url' ou 'webhook_limit'. */
export function addUrl(current: string[], url: string): string[] {
  const s = safeUrl(url);
  if (current.includes(s)) return current;
  if (current.length >= MAX_WEBHOOKS) throw new Error('webhook_limit');
  return [...current, s];
}
