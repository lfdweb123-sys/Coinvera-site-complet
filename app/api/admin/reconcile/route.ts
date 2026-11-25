import { db } from '@/lib/firebase-admin';
import { fail, requireAdmin } from '@/lib/auth';
import { fromUnits } from '@/lib/money';
// Controle : somme de tous les soldes marchands tenus par Coinvera (disponible, crédits cartes, montants réservés) == credits - debits des comptes marchands du registre.
export async function GET(req: Request) {
  try { await requireAdmin(req);
    let bal = 0; (await db.collection('balances').get()).forEach(d => { const x = d.data(); bal += (x.available ?? 0) + (x.reserved ?? 0) + (x.card_credit ?? 0) + (x.card_reserved ?? 0) + (x.scarab_credit ?? 0) + (x.scarab_reserved ?? 0); });
    let led = 0; (await db.collection('ledger_entries').get()).forEach(d => (d.data().lines as any[]).forEach(l => { if (String(l.account).startsWith('merchant:')) led += l.dir === 'credit' ? l.amount : -l.amount; }));
    return Response.json({ balances: fromUnits(bal), ledger: fromUnits(led), consistent: bal === led });
  } catch (e) { return fail(e); }
}
