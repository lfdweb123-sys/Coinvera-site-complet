import { guard, scopeParam } from '@/lib/fiat/http';
import { listMethods } from '@/lib/fiat/orders';
// Moyens de paiement mobile money / virement proposés pour les cartes (liste vide tant que le service n'est pas activé et configuré).
export const GET = guard(async () => Response.json(await listMethods()), scopeParam);
