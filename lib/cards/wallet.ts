import crypto from 'node:crypto';
import { db } from '../firebase-admin';
import { HttpError } from '../auth';
import { ci, CORE } from './cryptoinfra';
import { getHolder } from './holder';
// Portefeuille du programme de cartes : les adresses de paiement viennent du prestataire (GET /v1/cards/wallet, compte de la plateforme), jamais d'une variable locale.
// Un paiement direct de l'utilisateur arrive donc directement dans le portefeuille qui finance les cartes. Chaque dépôt y paie `recharge_fee_bps` (en points de base).
export type Prog = { bps: number; addresses: Record<string, string> };
const MAP: Record<string, string> = { usdt_trc20: 'usdttrc20', usdt_bep20: 'usdtbsc' };
let cache: { t: number; p: Prog } | null = null;
export async function programme(): Promise<Prog> {
  if (cache && Date.now() - cache.t < 60_000) return cache.p;
  const d = (await ci('GET', '/v1/cards/wallet')).data ?? {};
  const w = ((d.wallets ?? []) as any[]).find(x => x.core_id === CORE() && x.held), addresses: Record<string, string> = {};
  for (const a of (w?.addresses ?? []) as any[]) if (a?.address && MAP[a.asset_id]) addresses[MAP[a.asset_id]] = String(a.address);
  if (!w && d.address && (d.wallets?.[0]?.core_id ?? CORE()) === CORE() && d.asset_id === 'usdt_trc20') addresses.usdttrc20 = String(d.address);   // anciens champs : premier portefeuille ouvert
  const p = { bps: Math.max(0, Math.min(2000, Number(w?.recharge_fee_bps ?? 0) || 0)), addresses }; cache = { t: Date.now(), p }; return p;
}
// Montant à envoyer pour que le portefeuille reçoive `units` nets des frais de dépôt du prestataire (arrondi au supérieur).
export const grossUp = (units: number, bps: number) => Math.ceil((units * 10000) / (10000 - bps));
export const netOf = (units: number, bps: number) => Math.floor((units * (10000 - bps)) / 10000);

// Adresses de dépôt PERSONNELLES de l'utilisateur chez le prestataire (POST /v1/users puis GET /v1/users/{id}/addresses) : une adresse permanente par réseau.
// L'identifiant envoyé est un nombre de 5 à 10 chiffres ; on réutilise celui du titulaire de carte s'il existe, sinon on en réserve un dédié (même espace d'identifiants).
// Sur TRON et BSC le dépôt n'a aucun frais de plateforme : le montant reçu est le montant envoyé (bps = 0).
const CHAIN_ASSET: Record<string, string> = { tron: 'usdttrc20', bsc: 'usdtbsc' };
async function payExternalId(uid: string): Promise<string> {
  const h = await getHolder(uid); if (h?.externalId) return String(h.externalId);
  const ref = db.doc(`card_pay_users/${uid}`); const s = await ref.get(); if (s.exists) return String(s.data()!.externalId);
  for (let i = 0; i < 10; i++) {
    const id = String(crypto.randomInt(100_000_000, 1_000_000_000));
    try { await db.doc(`card_holder_ids/${id}`).create({ uid, createdAt: Date.now(), payOnly: true }); }
    catch { continue; }   // déjà pris : on retire
    try { await ref.create({ externalId: id, createdAt: Date.now() }); return id; } catch { return String((await ref.get()).data()!.externalId); }   // deux demandes simultanées : on garde la première
  }
  throw new HttpError(500, 'id_generation_failed');
}
export async function userPayAccount(uid: string): Promise<Prog> {
  const ext = await payExternalId(uid);
  const r = await ci('POST', '/v1/users', { body: { external_user_id: ext } });   // idempotent : renvoie l'utilisateur existant avec ses adresses
  let list = (r.data?.addresses ?? []) as any[];
  if (!list.length) list = ((await ci('GET', `/v1/users/${ext}/addresses`)).data?.addresses ?? []) as any[];
  const addresses: Record<string, string> = {};
  for (const a of list) if (a?.address && CHAIN_ASSET[a.chain]) addresses[CHAIN_ASSET[a.chain]] = String(a.address);
  return { bps: 0, addresses };
}
// Adresses à utiliser pour cet utilisateur : les siennes ; à défaut (échec côté prestataire) le portefeuille du programme s'il en expose, sinon la vraie erreur remonte.
export async function payAccount(uid: string): Promise<Prog> {
  let err: unknown = null;
  try { const a = await userPayAccount(uid); if (Object.keys(a.addresses).length) return a; } catch (e) { err = e; }
  try { const p = await programme(); if (Object.keys(p.addresses).length) return p; } catch (e) { err = err ?? e; }
  if (err) throw err; return { bps: 0, addresses: {} };
}
