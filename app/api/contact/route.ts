import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { fail, requireUser } from '@/lib/auth';
import { ipOf, rateLimit } from '@/lib/ratelimit';
import { sendMail } from '@/lib/brevo';
import { simpleEmail } from '@/lib/mail';
import { notify } from '@/lib/audit';
import { checkCaptcha } from '@/lib/captcha';
import { info } from '@/lib/log';
const Common = z.object({ subject: z.string().min(3).max(120), category: z.enum(['Support technique', 'Paiement', 'Retrait', 'API', 'WooCommerce', 'Compte', 'Autre']), message: z.string().min(10).max(4000), website: z.string().max(0).optional() });
// Visiteur : nom, e-mail et calcul anti-spam obligatoires. Utilisateur connecté (tableau de bord) : identité prise du compte côté serveur, pas de calcul.
const Public = Common.extend({ name: z.string().min(2).max(80), email: z.string().email(), captchaToken: z.string(), captchaAnswer: z.string() });
export async function POST(req: Request) {
  try {
    await rateLimit('contact_' + ipOf(req), 5, 3600);                      // anti-spam : 5 messages / heure / IP
    const raw = await req.json(); let merchantId: string | null = null; let name: string, email: string, b: z.infer<typeof Common>;
    if (req.headers.get('authorization')) {
      const u = await requireUser(req); merchantId = u.uid; b = Common.parse(raw);
      email = u.email; name = String(u.merchant.fullName || u.merchant.company || 'Marchand').slice(0, 80);
    } else {
      const { captchaToken, captchaAnswer, name: n, email: e, ...rest } = Public.parse(raw);
      await checkCaptcha(captchaToken, captchaAnswer);                // 'website' = honeypot : doit rester vide
      b = rest; name = n; email = e;
    }
    b.subject = b.subject.replace(/[\r\n]+/g, ' ').trim(); name = name.replace(/[\r\n]+/g, ' ').trim();
    const ref = await db.collection('support_tickets').add({ subject: b.subject, category: b.category, message: b.message, name, email, merchantId, status: 'New', priority: 'normal', assignedTo: null, replies: [], createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    info('contact.ticket_created', { ticketId: ref.id, category: b.category, merchantId });
    await notify('admin', `Nouveau ticket : ${b.subject}`, ref.id);
    const html = simpleEmail({ title: b.subject, paragraphs: [b.message], rows: [['Catégorie', b.category], ['De', `${name} (${email})`], ...(merchantId ? [['Marchand', merchantId] as [string, string]] : []), ['Ticket', ref.id]], note: 'Nouveau ticket reçu sur Coinvera.' });
    await Promise.allSettled([sendMail(process.env.SUPPORT_EMAIL!, `[Ticket] ${b.subject}`, html),
      // accusé de réception : seulement vers l'e-mail d'un compte connecté, jamais vers une adresse saisie par un visiteur (anti-relais d'e-mails)
      ...(merchantId ? [sendMail(email, 'Nous avons bien reçu votre message', simpleEmail({ title: 'Nous avons bien reçu votre message', name, paragraphs: ['Votre demande a bien été reçue. Nous vous répondrons rapidement.'], rows: [['Sujet', b.subject], ['Référence', ref.id]], note: 'Vous recevez ce message car vous avez écrit au support Coinvera.' }))] : [])]);
    return Response.json({ ok: true, id: ref.id }, { status: 201 });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
