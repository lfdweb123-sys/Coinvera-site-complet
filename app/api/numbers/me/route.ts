import { guard } from '@/lib/numbers/http';
import { readState, view } from '@/lib/numbers/rating';
// Note de l'utilisateur selon le barème de la documentation 5sim (96 points au départ ; 0 = achats bloqués 24 h).
export const GET = guard(async (_req, _c, u) => Response.json(view(await readState(u.uid))));
