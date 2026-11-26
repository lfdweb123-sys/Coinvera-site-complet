import { z } from 'zod';
import { rateLimit } from '@/lib/ratelimit';
import { AMOUNT, guard, scopeParam } from '@/lib/fiat/http';
import { quoteFiat } from '@/lib/fiat/orders';
import { fmtLocal } from '@/lib/fiat/quote';
// Prix en monnaie locale pour un montant en dollars (le taux est figé à la création de la commande).
export const GET = guard(async (req, _c, u) => {
  const p = new URL(req.url).searchParams; const b = z.object({ method: z.string().max(40), amount: AMOUNT }).parse({ method: p.get('method'), amount: p.get('amount') }); await rateLimit('fiatq_' + u.uid, 120, 3600);
  const q = await quoteFiat(b.method, b.amount);
  return Response.json({ method: q.m.id, label: q.m.label, local: q.local, localText: fmtLocal(q.local), creditUsd: Number(b.amount).toFixed(2), usdt: Number(b.amount).toFixed(2), min: q.m.min });
}, scopeParam);
