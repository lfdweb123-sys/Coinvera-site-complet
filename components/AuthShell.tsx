import Link from 'next/link';
import { LogoMark } from '@/components/Illustrations';
import { BannerArt } from '@/components/Art';
import { CardLogos } from '@/components/Logos';
export default function AuthShell({ title, sub, children, foot }: { title: string; sub?: React.ReactNode; children: React.ReactNode; foot?: React.ReactNode }) {
  return <div className="authp"><div className="auth-l"><Link href="/" className="logo" aria-label="Retour à l’accueil"><LogoMark s={36} />Coinvera</Link>
    <div className="auth-c"><h1>{title}</h1>{sub && <p className="mut" style={{ fontSize: 16, marginBottom: 24 }}>{sub}</p>}{children}{foot}</div>
    <p className="mut" style={{ fontSize: 12.5, margin: 0 }}>© {new Date().getFullYear()} Coinvera LLC. Tous droits réservés. · <Link href="/terms">Conditions</Link> · <Link href="/privacy">Confidentialité</Link> · <Link href="/contact">Support</Link></p></div>
    <aside className="auth-r on-dark"><BannerArt v={3} /><div style={{ marginBottom: 'auto', alignSelf: 'flex-start' }}><span className="cl" style={{ background: 'rgba(255,255,255,.12)', width: 'auto', padding: '8px 14px', color: '#fff', fontWeight: 700 }}><LogoMark s={26} /><span style={{ marginLeft: 8 }}>Coinvera</span></span></div>
      <div style={{ marginBottom: 18 }}><CardLogos /></div><p style={{ color: '#C9D5EA', fontSize: 18, margin: '0 0 8px' }}>Acceptez les cartes, retirez en crypto</p><h2>Simple · Direct · Sans frontières</h2></aside></div>;
}
