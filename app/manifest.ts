export default function manifest() {
  return {
    id: '/', name: 'Coinvera', short_name: 'Coinvera', description: 'Encaissez par carte, retirez en crypto.', lang: 'fr', dir: 'ltr',
    start_url: '/', scope: '/', display: 'standalone', orientation: 'portrait-primary', background_color: '#ffffff', theme_color: '#0A1535', categories: ['finance', 'business'],
    icons: [
      ...[96, 144, 192, 256, 384, 512].map(n => ({ src: `/icons/icon-${n}.png`, sizes: `${n}x${n}`, type: 'image/png', purpose: 'any' })),
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}
