import { z } from 'zod';
import { db } from './firebase-admin';
import { HttpError } from './auth';
import { ipOf, rateLimit } from './ratelimit';
export const LicBody = z.object({ licenseKey: z.string().min(10).max(80), siteUrl: z.string().url().max(200) });
export const bad = (e: unknown) => e instanceof z.ZodError;
export async function lic(req: Request) {
  await rateLimit('lic_' + ipOf(req), 60, 60);
  const b = LicBody.parse(await req.json());
  const s = await db.collection('woocommerce_licenses').where('key', '==', b.licenseKey).limit(1).get();
  if (s.empty) throw new HttpError(404, 'license_not_found');
  return { ref: s.docs[0].ref, d: s.docs[0].data(), site: new URL(b.siteUrl).origin };
}
