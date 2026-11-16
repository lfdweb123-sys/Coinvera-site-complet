import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { fail, requireUser } from '@/lib/auth';
import { ipOf, rateLimit } from '@/lib/ratelimit';
import { esc, sendMail } from '@/lib/brevo';
import { notify } from '@/lib/audit';
const Body = z.object({ name: z.string().min(2).max(80), email: z.string().email(), subject: z.string().min(3).max(120),
  category: z.enum(['Support technique', 'Paiement', 'Retrait', 'API', 'WooCommerce', 'Compte', 'Autre']), message: z.string().min(10).max(4000), website: z.string().max(0).optional() });
export async function POST(req: Request) {
  try {
    await rateLimit('contact_' + ipOf(req), 5, 3600);                      // anti-spam : 5 messages / heure / IP
    const { website, ...b } = Body.parse(await req.json());                // 'website' = honeypot : doit rester vide
    let merchantId: string | null = null;
    if (req.headers.get('authorization')) merchantId = (await requireUser(req)).uid;
    const ref = await db.collection('support_tickets').add({ ...b, merchantId, status: 'New', priority: 'normal', assignedTo: null, replies: [], createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    await notify('admin', `Nouveau ticket : ${b.subject}`, ref.id);
    const html = `<p><b>${esc(b.category)}</b> — ${esc(b.name)} (${esc(b.email)})${merchantId ? ' — marchand ' + merchantId : ''}</p><p>${esc(b.message).replace(/\n/g, '<br>')}</p><p>Ticket ${ref.id}</p>`;
    await Promise.allSettled([sendMail(process.env.SUPPORT_EMAIL!, `[Ticket] ${b.subject}`, html),
      sendMail(b.email, 'Nous avons bien reçu votre message', `<p>Bonjour ${esc(b.name)},</p><p>Votre demande « ${esc(b.subject)} » a bien été reçue (réf. ${ref.id}). Nous vous répondrons rapidement.</p><p>L'équipe Coinvera</p>`)]);
    return Response.json({ ok: true, id: ref.id }, { status: 201 });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
