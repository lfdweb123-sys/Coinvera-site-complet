import { guard, scopeParam } from '@/lib/fiat/http';
import { bankList } from '@/lib/fiat/orders';
export const GET = guard(async () => Response.json({ banks: await bankList() }), scopeParam);
