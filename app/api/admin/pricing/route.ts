import { z } from 'zod';
import { db } from '@/lib/firebase-admin';
import { fail, requireAdmin } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { audit } from '@/lib/audit';
const Body = z.object({ platformFeeBps: z.number().int().min(0).max(2000), processingFeeBps: z.number().int().min(0).max(2000), apiActivationUsd: z.number().min(0), pluginPriceUsd: z.number().min(0),
  minWithdrawalUsd: z.number().min(0), maxWithdrawalUsd: z.number().min(1), withdrawalFeeTRX: z.number().min(0), withdrawalFeeETH: z.number().min(0), withdrawalFeeBSC: z.number().min(0), freeTrials: z.number().int().min(0).max(20), maxLicenseActivations: z.number().int().min(1).max(100), pluginVersion: z.string().max(20) }).partial();
export async function GET(req: Request) { try { await requireAdmin(req); return Response.json(await getSettings()); } catch (e) { return fail(e); } }
export async function PUT(req: Request) {
  try { const a = await requireAdmin(req); const b = Body.parse(await req.json()); const before = await getSettings();
    await db.doc('admin_settings/pricing').set(b, { merge: true });
    await audit(a.uid, 'pricing.update', { before, after: b });             // toute modification est historisee
    return Response.json({ ok: true });
  } catch (e) { return e instanceof z.ZodError ? Response.json({ error: 'invalid_request' }, { status: 400 }) : fail(e); }
}
