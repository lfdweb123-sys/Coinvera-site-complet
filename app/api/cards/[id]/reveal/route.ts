import { rateLimit } from '@/lib/ratelimit';
import { guard, idOf } from '@/lib/cards/http';
import { ci } from '@/lib/cards/cryptoinfra';
import { ownedCard } from '@/lib/cards/cards';
import { requireHolder } from '@/lib/cards/holder';
// Numéro, CVV et date s'affichent dans la page sécurisée du prestataire (iframe) : on ne journalise ni ne stocke jamais ces valeurs ni le lien.
export const POST = guard(async (_r, ctx, u) => {
  const id = await idOf(ctx); await ownedCard(u.uid, id); const h = await requireHolder(u.uid); await rateLimit('cardreveal_' + u.uid, 30, 3600);
  const d = (await ci('POST', `/v1/cards/${id}/reveal`, { body: { user_id: h.externalId } })).data;
  return Response.json({ revealUrl: d.reveal_url ?? null, pan: d.pan ?? null, cvv: d.cvv ?? null, expiry: d.expiry ?? null }, { headers: { 'Cache-Control': 'no-store' } });
});
