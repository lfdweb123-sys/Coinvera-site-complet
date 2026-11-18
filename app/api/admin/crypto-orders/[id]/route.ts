import { z } from 'zod';
import { fail, requireAdmin } from '@/lib/auth';
import { confirmManually } from '@/lib/crypto-orders';
import { audit } from '@/lib/audit';
// Confirmation manuelle par un administrateur (ex. montant different du montant exact demande), toujours journalisee.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const a = await requireAdmin(req); const { id } = await params; const { txid } = z.object({ txid: z.string().max(120).default('') }).parse(await req.json());
    await confirmManually(id, txid); await audit(a.uid, 'crypto_order.manual_confirm', { orderId: id, txid }); return Response.json({ ok: true });
  } catch (e) { return fail(e); }
}
