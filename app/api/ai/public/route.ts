import { z } from 'zod';
import { fail, HttpError } from '@/lib/auth';
import { ipOf, rateLimit } from '@/lib/ratelimit';
import { getSettings } from '@/lib/settings';
import { streamClaude } from '@/lib/ai/claude';
import { publicPrompt, visitorMessages, VisitorBody } from '@/lib/ai/public';
export const maxDuration = 60;
// Coinvera AI pour les visiteurs (sans compte). Réponse en flux (texte brut), rien n'est enregistré côté serveur.
// Protections contre l'abus (chaque message coûte un appel au modèle) : même origine uniquement, quota par IP (heure et jour), plafond global par jour,
// et un interrupteur d'urgence : COINVERA_AI_PUBLIC=off désactive l'endpoint sans redéploiement du code.
export async function POST(req: Request) {
  try {
    if (process.env.COINVERA_AI_PUBLIC === 'off') throw new HttpError(503, 'ai_not_configured');
    const site = req.headers.get('sec-fetch-site'); if (site && site !== 'same-origin') throw new HttpError(403, 'forbidden');
    const ip = ipOf(req); await rateLimit('aip_h_' + ip, 8, 3600); await rateLimit('aip_d_' + ip, 25, 86400);
    const b = VisitorBody.parse(await req.json());
    await rateLimit('aip_all', 3000, 86400);
    const stream = await streamClaude(publicPrompt(await getSettings()), visitorMessages(b), req.signal);
    const reader = stream.getReader(), enc = new TextEncoder();
    const out = new ReadableStream<Uint8Array>({
      async pull(ctrl) { try { const { done, value } = await reader.read(); if (done) { ctrl.close(); return; } ctrl.enqueue(enc.encode(value)); } catch { ctrl.error(new Error('ai_stream_error')); } },
      async cancel() { await reader.cancel().catch(() => {}); },
    });
    return new Response(out, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
