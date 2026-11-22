import { getSettings } from '@/lib/settings';
import { PLUGIN_VERSIONS, isPluginKey, pluginDownloadUrl } from '@/lib/plugins';
import { SITE } from '@/lib/site';
// Sans paramètre : plugin WooCommerce (comportement inchangé). ?plugin=donations|invoices|subscriptions|tickets : version publiée de ce plugin.
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams.get('plugin');
  if (isPluginKey(p)) return Response.json({ version: PLUGIN_VERSIONS[p], download_url: pluginDownloadUrl(process.env.NEXT_PUBLIC_SITE_URL ?? SITE, p) });
  const s = await getSettings();
  return Response.json({ version: s.pluginVersion, download_url: `${process.env.NEXT_PUBLIC_SITE_URL}/downloads/coinvera-crypto-gateway.zip` });
}
