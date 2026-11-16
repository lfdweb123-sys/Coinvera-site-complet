'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { LogoMark } from '@/components/Illustrations';
const L = [['/features', 'Fonctionnalités'], ['/pricing', 'Tarification'], ['/woocommerce', 'WooCommerce'], ['https://docs.coinvera.com', 'Documentation'], ['/contact', 'Contact']];
export function Header() {
  const [o, setO] = useState(false);
  return <><header className="hdr"><div className="wrap"><Link href="/" className="logo" aria-label="Coinvera, accueil"><LogoMark />Coinvera</Link>
    <nav className="nav" aria-label="Navigation principale">{L.map(([h, l]) => <Link key={h} href={h} className="l">{l}</Link>)}</nav>
    <div className="hdr-cta"><Link href="/login" className="btn">Connexion</Link><Link href="/register" className="btn p">Créer un compte</Link></div>
    <button className="btn burger" aria-label="Menu" aria-expanded={o} onClick={() => setO(!o)} style={{ padding: 0, width: 44 }}>{o ? <X size={20} /> : <Menu size={20} />}</button></div></header>
    <div className={'drawer' + (o ? ' open' : '')}>{L.map(([h, l]) => <Link key={h} href={h} className="l" onClick={() => setO(false)}>{l}</Link>)}<Link href="/login" className="btn lg" onClick={() => setO(false)}>Connexion</Link><Link href="/register" className="btn p lg" onClick={() => setO(false)}>Créer un compte</Link></div></>;
}
export function Footer() {
  return <footer className="foot"><div className="wrap"><div className="cols">
    <div><div className="logo" style={{ color: '#fff', marginBottom: 14 }}><LogoMark />Coinvera</div><p style={{ maxWidth: 320 }}>Encaissez par carte, retirez en cryptomonnaie. Une plateforme pensée pour les marchands et les développeurs.</p></div>
    <div><h4>Produit</h4><ul><li><Link href="/features">Fonctionnalités</Link></li><li><Link href="/pricing">Tarification</Link></li><li><Link href="/woocommerce">Plugin WooCommerce</Link></li><li><a href="https://docs.coinvera.com">Documentation API</a></li></ul></div>
    <div><h4>Entreprise</h4><ul><li><Link href="/contact">Contact</Link></li><li><Link href="/register">Créer un compte</Link></li><li><Link href="/login">Connexion</Link></li></ul></div>
    <div><h4>Légal</h4><ul><li><Link href="/terms">Conditions d’utilisation</Link></li><li><Link href="/privacy">Confidentialité</Link></li><li><Link href="/refund-policy">Remboursement</Link></li></ul></div></div>
    <div className="risk"><p style={{ margin: 0 }}><b style={{ color: '#fff' }}>Avertissement sur les risques.</b> Les cryptomonnaies sont volatiles et comportent des risques de perte, de changement réglementaire et de défaillance technique. Les transactions blockchain sont irréversibles. Coinvera n’est pas une banque et ne fournit pas de conseil en investissement.</p>
      <div className="bar"><span>© {new Date().getFullYear()} Coinvera. Tous droits réservés.</span><span>Paiements sécurisés · 3-D Secure</span></div></div></div></footer>;
}
