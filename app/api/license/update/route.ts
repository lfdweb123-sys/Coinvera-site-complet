import { getSettings } from '@/lib/settings';
export async function GET() {
  const s = await getSettings();
  return Response.json({ version: s.pluginVersion, download_url: `${process.env.NEXT_PUBLIC_SITE_URL}/downloads/coinvera-crypto-gateway.zip` });
}
