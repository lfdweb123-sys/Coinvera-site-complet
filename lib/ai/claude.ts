import { HttpError } from '../auth';
import { error, warn } from '../log';
// Coinvera AI : API Messages d'Anthropic, modèle le moins coûteux de la gamme (Haiku). Serveur uniquement : la clé ne doit jamais atteindre le navigateur.
export const AI_MODEL = () => process.env.COINVERA_AI_MODEL?.trim() || 'claude-haiku-5-5';
export type Msg = { role: 'user' | 'assistant'; content: string };
// Ouvre le flux. Une réponse non-2xx est transformée en erreur AVANT d'ouvrir le flux côté client (aucun texte partiel).
export async function streamClaude(system: string, messages: Msg[], signal?: AbortSignal): Promise<ReadableStream<string>> {
  const key = process.env.ANTHROPIC_API_KEY?.trim(); if (!key) throw new HttpError(503, 'ai_not_configured');
  let r: Response;
  try { r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal, headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: AI_MODEL(), max_tokens: 900, stream: true, system, messages }) }); }
  catch (e) { warn('ai.unreachable', { message: (e as Error).message }); throw new HttpError(502, 'ai_unavailable'); }
  if (!r.ok || !r.body) { const t = await r.text().catch(() => ''); (r.status === 401 || r.status === 403 ? error : warn)('ai.upstream_error', { status: r.status, body: t.slice(0, 300) }); throw new HttpError(r.status === 429 ? 429 : 502, r.status === 429 ? 'ai_busy' : 'ai_unavailable'); }
  const reader = r.body.getReader(), dec = new TextDecoder(); let buf = '';
  return new ReadableStream<string>({
    async pull(ctrl) {
      for (;;) {
        const { done, value } = await reader.read(); if (done) { ctrl.close(); return; }
        buf += dec.decode(value, { stream: true }); const parts = buf.split('\n'); buf = parts.pop() ?? ''; let out = '';
        for (const line of parts) { if (!line.startsWith('data:')) continue; try { const j = JSON.parse(line.slice(5)); if (j.type === 'content_block_delta' && j.delta?.type === 'text_delta') out += j.delta.text; else if (j.type === 'error') { ctrl.error(new Error('ai_stream_error')); return; } } catch { /* ligne partielle ignorée */ } }
        if (out) { ctrl.enqueue(out); return; }
      }
    },
    cancel() { reader.cancel().catch(() => {}); },
  });
}
