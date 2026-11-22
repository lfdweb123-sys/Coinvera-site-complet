import { rateLimit } from '@/lib/ratelimit';
import { db } from '@/lib/firebase-admin';
import { HttpError } from '@/lib/auth';
import { guard, idOf } from '@/lib/cards/http';
import { ci } from '@/lib/cards/cryptoinfra';
import { ownedCard } from '@/lib/cards/cards';
import { requireHolder } from '@/lib/cards/holder';
// Code à usage unique (3-D Secure / portefeuille mobile) : lecture unique, jamais stocké ni journalisé.
export const GET = guard(async (_r, ctx, u) => {
  const id = await idOf(ctx); await ownedCard(u.uid, id); const h = await requireHolder(u.uid); await rateLimit('cardotp_' + u.uid, 60, 3600);
  try {
    const d = (await ci('GET', `/v1/cards/${id}/otp`, { query: { user_id: h.externalId } })).data;
    await db.doc(`card_items/${id}`).set({ otpWaiting: false }, { merge: true });
    return Response.json({ available: true, code: d.code, kind: d.kind, merchantName: d.merchant_name ?? null, amount: d.amount ?? null, currency: d.currency ?? null, expiresIn: d.expires_in_seconds }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { if ((e as HttpError).status === 404) { await db.doc(`card_items/${id}`).set({ otpWaiting: false }, { merge: true }); return Response.json({ available: false }); } throw e; }
});
