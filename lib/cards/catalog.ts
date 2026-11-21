import { HttpError } from '../auth';
import { toUnits } from '../money';
import { ci, CORE } from './cryptoinfra';
import { getHolder, readKyc } from './holder';
import { ownedCard } from './cards';
// Catalogue lu en direct chez le prestataire (jamais codé en dur), cartes virtuelles uniquement, mis en cache 60 s.
let cache: { t: number; p: any[] } | null = null;
export async function products(): Promise<any[]> {
  if (cache && Date.now() - cache.t < 60_000) return cache.p;
  const r = await ci('GET', '/v1/cards/products', { query: { core_id: CORE() } });
  const p = ((r.data.products ?? []) as any[]).filter(x => x.card_nature === 'VIRTUAL'); cache = { t: Date.now(), p }; return p;
}
export async function productOf(code: string) { const p = (await products()).find(x => x.code === code); if (!p) throw new HttpError(404, 'product_not_found'); return p; }
export async function assertNotInMaintenance() { const m = await ci('GET', '/v1/cards/maintenance'); if (m.data.active) throw new HttpError(503, 'cards_maintenance'); }
// Contrôles AVANT tout débit : maintenance, titulaire, vérification d'identité et montant minimum.
export async function assertCanIssue(uid: string, code: string, amount: string) {
  await assertNotInMaintenance();
  const h = await getHolder(uid); if (!h?.registered) throw new HttpError(409, 'card_holder_required');
  const p = await productOf(code);
  if (p.requires_kyc && (await readKyc(uid)) !== 'approved') throw new HttpError(409, 'kyc_not_approved');
  if (toUnits(amount) < toUnits(p.min_opening_balance ?? 0)) throw new HttpError(400, 'invalid_amount');
  return p;
}
export async function assertCanTopup(uid: string, cardId: number) {
  await assertNotInMaintenance(); const c = await ownedCard(uid, cardId);
  if (c.status === 'closed' || c.status === 'expired') throw new HttpError(409, 'card_state'); return c;
}
