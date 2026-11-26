import { ci } from './cryptoinfra';
// Dépenses du mois d'une carte virtuelle : achats réglés moins remboursements, d'après les opérations du réseau carte (calendrier UTC).
// Le résultat est mis en cache sur la carte (10 min) par la route /api/cards ; 3 pages d'opérations au plus par calcul.
export const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);
export const PAYMENT = '170', REFUND = '171', OK = '2';
export function sumSpent(txs: { type?: unknown; status?: unknown; amount?: unknown; occurred_at?: string | null }[], startMs: number) {
  let cents = 0, older = false;
  for (const t of txs) { const at = Date.parse(t.occurred_at ?? ''); if (Number.isFinite(at) && at < startMs) { older = true; continue; } if (String(t.status) !== OK) continue; const a = Math.round(Math.abs(Number(t.amount)) * 100); if (!Number.isFinite(a)) continue; if (String(t.type) === PAYMENT) cents += a; else if (String(t.type) === REFUND) cents -= a; }
  return { cents, older };
}
export async function fetchSpent(externalId: string, cardId: string) {
  const start = Date.parse(monthKey() + '-01T00:00:00Z'); let cents = 0;
  for (let page = 1; page <= 3; page++) {
    const d = (await ci('GET', `/v1/cards/${cardId}/transactions`, { query: { user_id: externalId, limit: 20, page } })).data, list = d.transactions ?? [], x = sumSpent(list, start);
    cents += x.cents; if (x.older || list.length < 20) break;
  }
  return Math.max(0, cents) / 100;
}
