import { HttpError } from '../auth';
import { spx } from './client';
import { scarabSettings } from './settings';
// Catalogue et portefeuille lus en direct chez le prestataire (jamais codés en dur), mis en cache quelques secondes.
let pc: { t: number; p: any[] } | null = null, wc: { t: number; w: Wallet } | null = null;
export type Wallet = { mode: 'live' | 'test'; availableMinor: number; mode_verification: 'merchant' | 'platform' | 'both'; plan: any | null };
export async function products(): Promise<any[]> {
  if (pc && Date.now() - pc.t < 60_000) return pc.p;
  const r = await spx('GET', '/products'); const p = Array.isArray(r.data) ? r.data : []; pc = { t: Date.now(), p }; return p;
}
export async function productOf(id: string) { const p = (await products()).find(x => x.id === id); if (!p) throw new HttpError(404, 'product_not_found'); return p; }
export async function visibleProducts() { const hidden = new Set((await scarabSettings()).hidden ?? []); return (await products()).filter(p => !hidden.has(p.id)); }
export async function wallet(fresh = false): Promise<Wallet> {
  if (!fresh && wc && Date.now() - wc.t < 30_000) return wc.w;
  const d = (await spx('GET', '/wallet')).data ?? {};
  const w: Wallet = { mode: d.mode === 'test' ? 'test' : 'live', availableMinor: Number(d.available_minor ?? 0), mode_verification: ['merchant', 'platform', 'both'].includes(d.cardholder_verification) ? d.cardholder_verification : 'merchant', plan: d.plan ?? null };
  wc = { t: Date.now(), w }; return w;
}
// merchant : tes propres clients vérifiés (customer_id). platform ou both : vérification ScarabPay, il suffit d'envoyer le nom à afficher sur la carte.
export const needsCustomer = (w: Wallet) => w.mode_verification === 'merchant';
