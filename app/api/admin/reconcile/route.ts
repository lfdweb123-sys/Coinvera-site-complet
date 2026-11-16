import { db } from '@/lib/firebase-admin';
import { fail, requireAdmin } from '@/lib/auth';
import { fromUnits } from '@/lib/money';
// Controle : somme des soldes marchands (disponible + reserve) == credits - debits des comptes marchands du registre.
export async function GET(req: Request) {
  try { await requireAdmin(req);
    let bal = 0; (await db.collection('balances').get()).forEach(d => bal += (d.data().available ?? 0) + (d.data().reserved ?? 0));
    let led = 0; (await db.collection('ledger_entries').get()).forEach(d => (d.data().lines as any[]).forEach(l => { if (String(l.account).startsWith('merchant:')) led += l.dir === 'credit' ? l.amount : -l.amount; }));
    return Response.json({ balances: fromUnits(bal), ledger: fromUnits(led), consistent: bal === led });
  } catch (e) { return fail(e); }
}
