import { rateLimit } from '@/lib/ratelimit';
import { guard } from '@/lib/cards/http';
import { readKyc, startKyc } from '@/lib/cards/holder';
export const GET = guard(async (_r, _c, u) => Response.json({ status: await readKyc(u.uid) }));
export const POST = guard(async (_r, _c, u) => { await rateLimit('cardkyc_' + u.uid, 10, 3600); return Response.json(await startKyc(u.uid)); });
