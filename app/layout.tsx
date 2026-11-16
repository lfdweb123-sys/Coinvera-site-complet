import './globals.css';
import type { Metadata } from 'next';
const url = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://coinvera.com';
export const metadata: Metadata = { metadataBase: new URL(url), title: { default: 'Coinvera — Encaissez par carte, retirez en crypto', template: '%s | Coinvera' },
  description: 'Acceptez les paiements par carte et retirez vos fonds en USDT. API, plugin WooCommerce et tableau de bord.', openGraph: { type: 'website', siteName: 'Coinvera', title: 'Coinvera', description: 'Encaissez par carte, retirez en crypto.' }, twitter: { card: 'summary_large_image' } };
export default function Root({ children }: { children: React.ReactNode }) {
  return <html lang="fr"><head><link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;700&display=swap" /></head><body>{children}</body></html>;
}
