// Plugins distribués avec la licence unique. La version du plugin WooCommerce reste pilotée par les réglages admin (pluginVersion).
// Les autres versions doivent rester identiques à l'en-tête et à la constante de chaque plugin (vérifié par tests/plugins.test.ts).
export const PLUGIN_VERSIONS = { donations: '1.2.1', invoices: '1.0.0', subscriptions: '1.0.0', tickets: '1.0.0', guard: '1.0.0', reminders: '1.0.0', returns: '1.0.0', einvoice: '1.0.0' } as const;
export type PluginKey = keyof typeof PLUGIN_VERSIONS;
export const isPluginKey = (k: unknown): k is PluginKey => typeof k === 'string' && Object.prototype.hasOwnProperty.call(PLUGIN_VERSIONS, k);
export const pluginZip = (k: PluginKey) => `/downloads/coinvera-${k}.zip`;
export const pluginDownloadUrl = (site: string, k: PluginKey) => `${site.replace(/\/+$/, '')}${pluginZip(k)}`;

export const DONATIONS = { version: PLUGIN_VERSIONS.donations, file: 'coinvera-donations.zip' } as const;
export const DONATIONS_ZIP = pluginZip('donations');
export const WOOCOMMERCE_ZIP = '/downloads/coinvera-crypto-gateway.zip';
export const donationsDownloadUrl = (site: string) => pluginDownloadUrl(site, 'donations');

// Liste affichée dans le tableau de bord et sur la page « Plugins ».
export const LISTED = [
  { key: 'woocommerce', name: 'Plugin WooCommerce', tagline: 'Acceptez les cartes dans votre boutique WooCommerce.', href: '/woocommerce', zip: WOOCOMMERCE_ZIP },
  { key: 'donations', name: 'Plugin de dons', tagline: 'Cagnottes et dons par carte, seul ou avec WooCommerce.', href: '/dons', zip: pluginZip('donations') },
  { key: 'invoices', name: 'Plugin de factures', tagline: 'Factures numérotées avec lien de paiement et relances.', href: '/factures', zip: pluginZip('invoices') },
  { key: 'subscriptions', name: 'Plugin d’abonnements', tagline: 'Abonnements par lien de paiement, avec accès aux contenus.', href: '/abonnements', zip: pluginZip('subscriptions') },
  { key: 'tickets', name: 'Plugin de billetterie', tagline: 'Billets avec QR code et contrôle d’entrée.', href: '/billetterie', zip: pluginZip('tickets') },
  { key: 'guard', name: 'Plugin anti-fraude', tagline: 'Bloque le card testing, les e-mails jetables et les tentatives répétées au checkout.', href: '/anti-fraude', zip: pluginZip('guard') },
  { key: 'einvoice', name: 'Plugin facturation électronique', tagline: 'Factures Factur-X conformes (EN 16931) et TVA calculée en temps réel selon l’adresse et l’IP du client.', href: '/facturation-electronique', zip: pluginZip('einvoice') },
  { key: 'reminders', name: 'Plugin relances WhatsApp', tagline: 'Relance les commandes en attente de paiement et notifie vos clients par WhatsApp.', href: '/relances-whatsapp', zip: pluginZip('reminders') },
  { key: 'returns', name: 'Plugin retours & échanges', tagline: 'Portail client en libre-service, avoir immédiat avec bonus ou remboursement validé.', href: '/retours', zip: pluginZip('returns') },
] as const;
