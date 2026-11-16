import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { fail, HttpError, requireUser } from '@/lib/auth';
import { postEntry, readBal, writeBal } from '@/lib/ledger';
import { toUnits } from '@/lib/money';
import { getSettings } from '@/lib/settings';
import { rows } from '@/lib/serialize';
import { rateLimit } from '@/lib/ratelimit';
const Body = z.object({ coin: z.string(), chain: z.string(), address: z.string().min(20).max(120), amount: z.number().positive() });
export async function POST(req: Request) {
  try {
    const u = await requireUser(req); await rateLimit('wd_' + u.uid, 5, 3600); const b = Body.parse(await req.json()); const s = await getSettings();
    if (!s.chains[b.coin]?.includes(b.chain)) throw new HttpError(400, 'unsupported_coin_or_network');
    const amt = toUnits(b.amount);
    if (amt < toUnits(s.minWithdrawalUsd) || amt > toUnits(s.maxWithdrawalUsd)) throw new HttpError(400, 'amount_out_of_limits');
    const wRef = db.collection('withdrawals').doc();
    await db.runTransaction(async tx => {
      const bal = await readBal(tx, u.uid);
      if (bal.available < amt) throw new HttpError(400, 'insufficient_balance');
      // Reservation : les fonds sortent du disponible AVANT tout envoi (protege contre les doubles depenses)
      postEntry(tx, `wd_reserve_${wRef.id}`, u.uid, 'withdrawal_reserved', [
        { account: `merchant:${u.uid}:available`, dir: 'debit', amount: amt }, { account: `merchant:${u.uid}:reserved`, dir: 'credit', amount: amt }]);
      writeBal(tx, u.uid, { ...bal, available: bal.available - amt, reserved: bal.reserved + amt });
      tx.set(wRef, { merchantId: u.uid, coin: b.coin, chain: b.chain, address: b.address, amountUnits: amt, status: 'queued', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    });
    return Response.json({ id: wRef.id, status: 'queued' }, { status: 201 });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}

export async function GET(req: Request) {
  try { const u = await requireUser(req);
    return Response.json({ items: rows(await db.collection('withdrawals').where('merchantId', '==', u.uid).orderBy('createdAt', 'desc').limit(100).get()) });
  } catch (e) { return fail(e); }
}
