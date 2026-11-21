import { guard, idOf } from '@/lib/cards/http';
import { ci } from '@/lib/cards/cryptoinfra';
import { ownedCard } from '@/lib/cards/cards';
import { requireHolder } from '@/lib/cards/holder';
const TYPES: Record<string, string> = { '170': 'Paiement', '171': 'Remboursement', '172': 'Frais de carte', '173': 'Retrait DAB', '174': 'Pré-autorisation', '150': 'Rechargement', '140': 'Émission de la carte' };
export const GET = guard(async (req, ctx, u) => {
  const id = await idOf(ctx); await ownedCard(u.uid, id); const h = await requireHolder(u.uid);
  const page = Math.max(1, Math.min(1000, Number(new URL(req.url).searchParams.get('page') ?? 1) || 1));
  const d = (await ci('GET', `/v1/cards/${id}/transactions`, { query: { user_id: h.externalId, limit: 20, page } })).data;
  return Response.json({ page, transactions: (d.transactions ?? []).map((t: any) => ({ id: t.id, at: t.occurred_at, amount: t.amount, currency: t.currency, merchant: t.merchant_name, type: TYPES[String(t.type)] ?? 'Opération', status: t.status === '2' ? 'ok' : t.status === '3' ? 'failed' : 'processing' })) });
});
