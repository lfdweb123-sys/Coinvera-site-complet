import { z } from 'zod';
import { rateLimit } from '@/lib/ratelimit';
import { guard, SPEC } from '@/lib/cards/http';
import { createPayOrder, payCurrencies } from '@/lib/cards/pay';
// Liste des réseaux de paiement direct. Si elle est vide, on renvoie la vraie cause (code) au lieu d'un message générique.
export const GET = guard(async () => {
  try {
    const currencies = await payCurrencies();
    return Response.json(currencies.length ? { currencies } : { currencies, problem: 'no_deposit_address' });
  } catch (e: any) {
    const problem = typeof e?.code === 'string' && e.code ? e.code : 'internal_error';
    console.warn('pay-orders: réseaux de paiement indisponibles', problem, e?.status ?? '');
    return Response.json({ currencies: [], problem });
  }
});
export const POST = guard(async (req, _c, u) => {
  const b = SPEC.extend({ cur: z.string().max(20) }).parse(await req.json()); await rateLimit('cardpay_' + u.uid, 10, 3600);
  const { cur, ...spec } = b; return Response.json(await createPayOrder(u.uid, cur, spec), { status: 201 });
});
