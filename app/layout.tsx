import './globals.css';
import type { Metadata, Viewport } from 'next';
import { SITE } from '@/lib/site';
import { ConfirmProvider } from '@/components/Confirm';
import HumanGate from '@/components/HumanGate';
import { headers } from 'next/headers';
import { THEME_SCRIPT } from '@/lib/theme';
const GTM_ID = 'GTM-PPT8XWXQ';
const GTM_SCRIPT = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;var n=d.querySelector('script[nonce]');if(n&&n.nonce)j.nonce=n.nonce;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');`;
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0A1535' };
export const metadata: Metadata = { metadataBase: new URL(SITE), verification: { google: 'PurzMs2tv9fK0vvy5w5q6C5H7UB5UTPCE3lrX8MIkv0' }, applicationName: 'Coinvera', appleWebApp: { capable: true, title: 'Coinvera', statusBarStyle: 'black-translucent' }, title: { default: 'Coinvera : encaissez par carte Visa et Mastercard, retirez en USDT', template: '%s | Coinvera' },
  description: 'Passerelle de paiement : acceptez les cartes Visa et Mastercard, retirez vos gains en USDT. Sans KYC, API, plugin WooCommerce et retraits automatiques.',
  keywords: ['passerelle de paiement', 'accepter les paiements par carte', 'paiement par carte Visa Mastercard', 'retrait USDT', 'encaisser en crypto', 'paiement sans KYC', 'API de paiement', 'plugin WooCommerce paiement', 'cartes virtuelles', 'solution de paiement en ligne', 'Coinvera'], authors: [{ name: 'Coinvera LLC' }], creator: 'Coinvera LLC', publisher: 'Coinvera LLC',
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 } },
  openGraph: { type: 'website', locale: 'fr_FR', siteName: 'Coinvera', title: 'Coinvera : encaissez par carte, retirez en USDT', description: 'Acceptez Visa et Mastercard, retirez en USDT. API, WooCommerce, retraits automatiques.' },
  twitter: { card: 'summary_large_image', title: 'Coinvera : encaissez par carte, retirez en USDT', description: 'Acceptez Visa et Mastercard, retirez en USDT.' }, category: 'finance', formatDetection: { telephone: false, email: false, address: false } };
export default async function Root({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;   // jeton CSP de la requête (voir proxy.ts) : rend aussi toutes les pages dynamiques, condition pour que Next.js y appose le jeton
  return <html lang="fr" suppressHydrationWarning><head><script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /><script nonce={nonce} dangerouslySetInnerHTML={{ __html: GTM_SCRIPT }} /><link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" /><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap" /></head><body><noscript><iframe src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`} height="0" width="0" style={{ display: 'none', visibility: 'hidden' }} /></noscript><ConfirmProvider>{children}</ConfirmProvider><HumanGate /></body></html>;
}
