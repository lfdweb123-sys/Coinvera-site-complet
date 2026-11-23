import crypto from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { db } from '@/lib/firebase-admin';
import { verifyApiRequest } from '@/lib/apikey';
import { fail, HttpError } from '@/lib/auth';
import { rateLimit } from '@/lib/ratelimit';
import { getSettings } from '@/lib/settings';
import { toUnits } from '@/lib/money';
import { recordSentMessage } from '@/lib/whatsapp-billing';
import { sendWhatsAppTemplate, toE164Digits, WhatsAppError } from '@/lib/whatsapp';
const Body = z.object({ to: z.string().min(5).max(20), country: z.string().length(2).optional(), kind: z.enum(['cart', 'status']), vars: z.array(z.string().max(200)).max(5).default([]) });
export async function POST(req: Request) {
  const raw = await req.text();
  let idemRef: FirebaseFirestore.DocumentReference | null = null;
  try {
    const a = await verifyApiRequest(req, raw);
    const body = Body.parse(JSON.parse(raw));
    await rateLimit('wa_' + a.merchantId, 120, 3600);   // 120 messages/heure/marchand : protège le compte WhatsApp partagé d'un abus par un seul site
    const idem = req.headers.get('idempotency-key');
    if (idem && !/^[A-Za-z0-9_.:-]{1,64}$/.test(idem)) throw new HttpError(400, 'invalid_idempotency_key');
    const bodyHash = crypto.createHash('sha256').update(raw).digest('hex');
    idemRef = idem ? db.doc(`idempotency_records/wa_${a.merchantId}_${idem}`) : null;
    if (idemRef) {   // réservation atomique : deux requêtes simultanées avec la même clé ne déclenchent jamais deux envois
      const won = await idemRef.create({ bodyHash, createdAt: Date.now(), ttl: Timestamp.fromMillis(Date.now() + 24 * 3600_000) }).then(() => true, () => false);
      if (!won) { const ex = (await idemRef.get()).data(); if (ex?.bodyHash !== bodyHash) throw new HttpError(409, 'idempotency_conflict'); if (ex.response) return Response.json(ex.response); throw new HttpError(409, 'request_in_progress'); }
    }
    try {
      const digits = toE164Digits(body.to, body.country ?? '');
      if (!digits) { const response = { error: 'invalid_phone' }; if (idemRef) await idemRef.update({ response }); return Response.json(response, { status: 422 }); }
      const s = await getSettings();
      const template = body.kind === 'cart' ? s.whatsappCartTemplate : s.whatsappStatusTemplate;
      const rateUsd = body.kind === 'cart' ? s.whatsappRateCartUsd : s.whatsappRateStatusUsd;
      let response: Record<string, unknown>;
      if (a.mode === 'test') response = { sent: false, simulated: true };   // on ne déclenche jamais un vrai envoi WhatsApp depuis une clé de test
      else {
        // Le coût Meta n'est débité qu'à la confirmation de livraison (webhook) ; ce contrôle évite seulement d'envoyer
        // un message qu'on sait déjà ne pas pouvoir facturer si le solde est à sec.
        const bal = (await db.doc(`balances/${a.merchantId}`).get()).data() ?? {};
        if ((bal.available ?? 0) < toUnits(rateUsd)) { const out = { error: 'insufficient_balance' }; if (idemRef) await idemRef.update({ response: out }); return Response.json(out, { status: 402 }); }
        const r = await sendWhatsAppTemplate(digits, template, s.whatsappLang, body.vars);
        if (r.id) await recordSentMessage(r.id, a.merchantId, body.kind);   // facturé plus tard, uniquement si le webhook Meta confirme la livraison
        response = { sent: true, id: r.id ?? null };
      }
      if (idemRef) await idemRef.update({ response });
      return Response.json(response, { status: 201 });
    } catch (e) { await idemRef?.delete().catch(() => {}); throw e; }   // échec : la clé est libérée pour permettre une nouvelle tentative
  } catch (e) {
    if (e instanceof z.ZodError) return Response.json({ error: 'invalid_request', issues: e.issues }, { status: 400 });
    if (e instanceof WhatsAppError) return Response.json({ error: e.code }, { status: 502 });
    return fail(e);
  }
}
