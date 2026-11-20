// Plugins distribués avec la licence unique. La version du plugin WooCommerce reste pilotée par les réglages admin (pluginVersion).
// La version du plugin de dons doit rester identique à l'en-tête de plugins/coinvera-donations/coinvera-donations.php (vérifié par tests/plugins.test.ts).
export const DONATIONS = { version: '1.0.0', file: 'coinvera-donations.zip' } as const;
export const DONATIONS_ZIP = `/downloads/${DONATIONS.file}`;
export const WOOCOMMERCE_ZIP = '/downloads/coinvera-crypto-gateway.zip';
export const donationsDownloadUrl = (site: string) => `${site.replace(/\/+$/, '')}${DONATIONS_ZIP}`;
