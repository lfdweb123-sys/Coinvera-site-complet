import './globals.css';
import type { Metadata, Viewport } from 'next';
import { SITE } from '@/lib/site';
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0A1535' };
export const metadata: Metadata = { metadataBase: new URL(SITE), applicationName: 'Coinvera', title: { default: 'Coinvera — Encaissez par carte, retirez en crypto', template: '%s | Coinvera' },
  description: 'Acceptez les paiements par carte et retirez vos fonds en USDT. API, plugin WooCommerce, retraits automatiques et tableau de bord complet.',
  keywords: ['paiement par carte', 'retrait USDT', 'passerelle de paiement', 'API de paiement', 'plugin WooCommerce', 'crypto', 'Coinvera'], authors: [{ name: 'COINVERA' }], creator: 'COINVERA', publisher: 'COINVERA', alternates: { canonical: '/' },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 } },
  openGraph: { type: 'website', locale: 'fr_FR', siteName: 'Coinvera', url: SITE, title: 'Coinvera — Encaissez par carte, retirez en crypto', description: 'Acceptez Visa et Mastercard, retirez en USDT. API, WooCommerce, retraits automatiques.' },
  twitter: { card: 'summary_large_image', title: 'Coinvera — Encaissez par carte, retirez en crypto', description: 'Acceptez Visa et Mastercard, retirez en USDT.' }, formatDetection: { telephone: false, email: false, address: false } };
export default function Root({ children }: { children: React.ReactNode }) {
  return <html lang="fr"><head><link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" /><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap" /></head><body>{children}</body></html>;
}
