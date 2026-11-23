import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { fail, requireAdmin, HttpError } from '@/lib/auth';
import { sendMail } from '@/lib/brevo';
import { simpleEmail } from '@/lib/mail';
import { audit } from '@/lib/audit';
const Body = z.object({ id: z.string(), status: z.enum(['New', 'Open', 'In Progress', 'Waiting for Customer', 'Resolved', 'Closed']).optional(), priority: z.enum(['low', 'normal', 'high']).optional(), reply: z.string().max(4000).optional() });
export async function PATCH(req: Request) {
  try { const a = await requireAdmin(req); const b = Body.parse(await req.json());
    const r = db.doc(`support_tickets/${b.id}`); const t = await r.get(); if (!t.exists) throw new HttpError(404, 'not_found');
    const up: any = { updatedAt: FieldValue.serverTimestamp(), assignedTo: a.uid };
    if (b.status) up.status = b.status; if (b.priority) up.priority = b.priority;
    if (b.reply) { up.replies = FieldValue.arrayUnion({ by: a.uid, text: b.reply, at: Date.now() }); if (!b.status) up.status = 'Waiting for Customer';
      await sendMail(t.data()!.email, `Re: ${t.data()!.subject}`, simpleEmail({ title: `Re: ${t.data()!.subject}`, paragraphs: [b.reply, `Réf. ${b.id}`], note: 'Vous recevez ce message en réponse à votre demande auprès du support Coinvera.' })).catch(() => {}); }
    await r.update(up); await audit(a.uid, 'ticket.update', { id: b.id, status: b.status, replied: !!b.reply });
    return Response.json({ ok: true });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
