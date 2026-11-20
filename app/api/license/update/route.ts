import { getSettings } from '@/lib/settings';
import { DONATIONS, donationsDownloadUrl } from '@/lib/plugins';
import { SITE } from '@/lib/site';
// Sans paramètre : plugin WooCommerce (comportement inchangé). ?plugin=donations : plugin de dons.
export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get('plugin') === 'donations')
    return Response.json({ version: DONATIONS.version, download_url: donationsDownloadUrl(process.env.NEXT_PUBLIC_SITE_URL ?? SITE) });
  const s = await getSettings();
  return Response.json({ version: s.pluginVersion, download_url: `${process.env.NEXT_PUBLIC_SITE_URL}/downloads/coinvera-crypto-gateway.zip` });
}
