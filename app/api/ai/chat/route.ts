import { z } from 'zod';
import { db } from '@/lib/firebase-admin';
import { fail, HttpError, requireUser } from '@/lib/auth';
import { rateLimit } from '@/lib/ratelimit';
import { streamClaude, type Msg } from '@/lib/ai/claude';
import { systemPrompt } from '@/lib/ai/knowledge';
import { warn } from '@/lib/log';
export const maxDuration = 60;
const MAX_KEEP = 100, CONTEXT = 20;   // messages conservés par conversation / envoyés au modèle
// Envoie un message à Coinvera AI. Réponse en flux (texte brut) ; l'historique est enregistré côté serveur et rattaché à la personne.
export async function POST(req: Request) {
  try {
    const u = await requireUser(req); if (u.role === 'admin') throw new HttpError(403, 'forbidden');
    await rateLimit('ai_h_' + u.uid, 30, 3600); await rateLimit('ai_d_' + u.uid, 120, 86400);
    const b = z.object({ chatId: z.string().regex(/^[A-Za-z0-9]{10,40}$/).optional(), message: z.string().trim().min(1).max(2000) }).parse(await req.json());
    const ref = b.chatId ? db.doc(`ai_chats/${b.chatId}`) : db.collection('ai_chats').doc(); const snap = b.chatId ? await ref.get() : null;
    if (snap && (!snap.exists || snap.data()!.uid !== u.uid)) throw new HttpError(404, 'not_found');
    const past: { r: 'u' | 'a'; t: string; at: number }[] = snap?.data()?.messages ?? [];
    const msgs: Msg[] = [...past, { r: 'u' as const, t: b.message, at: 0 }].slice(-CONTEXT).map(m => ({ role: m.r === 'u' ? 'user' : 'assistant', content: m.t }));
    while (msgs.length && msgs[0].role !== 'user') msgs.shift();   // l'API exige de commencer par un message utilisateur
    const stream = await streamClaude(await systemPrompt(u.uid, { ...u.merchant, status: u.merchant.status }), msgs, req.signal);
    const now = Date.now(); let answer = '';
    const save = async (complete: boolean) => {
      const text = answer.trim(); if (!text) return;
      const messages = [...past, { r: 'u' as const, t: b.message, at: now }, { r: 'a' as const, t: complete ? text : text + ' …', at: Date.now() }].slice(-MAX_KEEP);
      await ref.set({ uid: u.uid, title: snap?.data()?.title ?? b.message.slice(0, 60), messages, createdAt: snap?.data()?.createdAt ?? now, updatedAt: Date.now() }, { merge: true });
    };
    const reader = stream.getReader(), enc = new TextEncoder();
    const out = new ReadableStream<Uint8Array>({
      async pull(ctrl) { try { const { done, value } = await reader.read(); if (done) { await save(true).catch(e => warn('ai.save_failed', { message: (e as Error).message })); ctrl.close(); return; } answer += value; ctrl.enqueue(enc.encode(value)); } catch { await save(false).catch(() => {}); ctrl.error(new Error('ai_stream_error')); } },
      async cancel() { await reader.cancel().catch(() => {}); await save(false).catch(() => {}); },
    });
    return new Response(out, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Chat-Id': ref.id, 'X-Accel-Buffering': 'no' } });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
