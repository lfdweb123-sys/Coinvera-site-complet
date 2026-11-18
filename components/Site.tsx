'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { LogoMark } from '@/components/Illustrations';
import { CardLogos } from '@/components/Logos';
import { useAuthUser } from '@/lib/client';
import { DOCS, HELP, STATUS } from '@/lib/site';
const L = [['/features', 'Fonctionnalités'], ['/pricing', 'Tarification'], ['/woocommerce', 'WooCommerce'], [DOCS, 'Documentation'], ['/contact', 'Contact']];
export function Header() {
  const [o, setO] = useState(false); const path = usePathname(); const { user } = useAuthUser();
  const cta = user ? <Link href="/dashboard" className="btn p">Tableau de bord</Link> : <><Link href="/login" className="btn">Connexion</Link><Link href="/register" className="btn p">Créer un compte</Link></>;
  return <><header className="hdr"><div className="bar"><Link href="/" className="logo" aria-label="Coinvera, accueil"><LogoMark />Coinvera</Link>
    <nav className="nav" aria-label="Navigation principale">{L.map(([h, l]) => <Link key={h} href={h} className={'l' + (path === h ? ' on' : '')}>{l}</Link>)}</nav>
    <div className="hdr-cta">{cta}</div>
    <button className="btn burger" aria-label="Menu" aria-expanded={o} onClick={() => setO(!o)} style={{ padding: 0, width: 44 }}>{o ? <X size={20} /> : <Menu size={20} />}</button></div></header>
    <div className={'drawer' + (o ? ' open' : '')}>{L.map(([h, l]) => <Link key={h} href={h} className="l" onClick={() => setO(false)}>{l}</Link>)}
      {user ? <Link href="/dashboard" className="btn p lg" onClick={() => setO(false)}>Tableau de bord</Link> : <><Link href="/login" className="btn lg" onClick={() => setO(false)}>Connexion</Link><Link href="/register" className="btn p lg" onClick={() => setO(false)}>Créer un compte</Link></>}</div></>;
}
export function Footer() {
  return <footer className="foot"><div className="in2"><div className="cols">
    <div><div className="logo" style={{ color: '#fff', marginBottom: 16 }}><LogoMark />Coinvera</div><p style={{ maxWidth: 340 }}>Encaissez par carte, retirez en cryptomonnaie. La plateforme de paiement pensée pour les marchands et les développeurs.</p><div style={{ marginTop: 16 }}><CardLogos /></div></div>
    <div><h4>Produit</h4><ul><li><Link href="/features">Fonctionnalités</Link></li><li><Link href="/pricing">Tarification</Link></li><li><Link href="/woocommerce">Plugin WooCommerce</Link></li></ul></div>
    <div><h4>Développeurs</h4><ul><li><a href={DOCS}>Documentation API</a></li><li><a href={HELP}>Centre d’aide</a></li><li><a href={STATUS}>État des services</a></li><li><Link href="/register">Créer un compte</Link></li></ul></div>
    <div><h4>Entreprise</h4><ul><li><Link href="/contact">Contact</Link></li><li><Link href="/login">Connexion</Link></li></ul></div>
    <div><h4>Légal</h4><ul><li><Link href="/terms">Conditions d’utilisation</Link></li><li><Link href="/privacy">Confidentialité</Link></li><li><Link href="/refund-policy">Remboursement</Link></li></ul></div></div>
    <div className="risk"><p style={{ margin: 0 }}><b style={{ color: '#fff' }}>Avertissement sur les risques.</b> Les cryptomonnaies sont volatiles et comportent des risques de perte, de changement réglementaire et de défaillance technique. Les transactions sont irréversibles. COINVERA n’est pas une banque et ne fournit pas de conseil en investissement.</p>
      <div className="bar2"><span>© {new Date().getFullYear()} COINVERA. Tous droits réservés.</span><span>www.coinvera.me</span></div></div></div></footer>;
}
