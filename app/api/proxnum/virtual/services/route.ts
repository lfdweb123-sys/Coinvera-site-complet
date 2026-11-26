import { z } from 'zod';
import { guard } from '@/lib/proxnum/http';
import { virtualServices } from '@/lib/proxnum/pricing';
export const GET = guard(async req => { const c = z.coerce.number().int().min(0).parse(new URL(req.url).searchParams.get('country')); return Response.json({ services: await virtualServices(c) }); });
