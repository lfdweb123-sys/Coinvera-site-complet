import { guard } from '@/lib/proxnum/http';
import { virtualCountries } from '@/lib/proxnum/pricing';
export const GET = guard(async () => Response.json({ countries: await virtualCountries() }));
