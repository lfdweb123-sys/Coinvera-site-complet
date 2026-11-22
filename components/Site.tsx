'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { LogoMark } from '@/components/Illustrations';
import { CardLogos } from '@/components/Logos';
import { useAuthUser } from '@/lib/client';
import { DOCS, HELP, SITE, STATUS } from '@/lib/site';
const L = [['/features', 'Fonctionnalités'], ['/cartes', 'Cartes'], ['/pricing', 'Tarification'], ['/plugins', 'Plugins'], [DOCS, 'Documentation'], ['/contact', 'Contact']];
// Depuis docs.*, status.* ou helpcenter.*, un lien relatif (/pricing) resterait sur le sous-domaine, où il est réécrit vers la page du sous-domaine :
// les liens internes du header et du footer pointent donc vers le site principal, page exacte comprise. Sur le site principal (ou en local) ils restent relatifs.
const SUB = /^(docs|status|helpcenter|api)\./i;
function useBase(base: string) { const [b, setB] = useState(base); useEffect(() => { setB(SUB.test(window.location.hostname) ? SITE : ''); }, []); return b; }
export function Header({ base = '' }: { base?: string }) {
  const b = useBase(base); const to = (h: string) => (h.startsWith('/') ? b + h : h);
  const [o, setO] = useState(false); const path = usePathname(); const { user } = useAuthUser();
  const cta = user ? <Link href={to('/dashboard')} className="btn p">Tableau de bord</Link> : <><Link href={to('/login')} className="btn">Connexion</Link><Link href={to('/register')} className="btn p">Créer un compte</Link></>;
  return <><header className="hdr"><div className="bar"><Link href={to('/')} className="logo" aria-label="Coinvera, accueil"><LogoMark />Coinvera</Link>
    <nav className="nav" aria-label="Navigation principale">{L.map(([h, l]) => <Link key={h} href={to(h)} className={'l' + (path === h ? ' on' : '')}>{l}</Link>)}</nav>
    <div className="hdr-cta">{cta}</div>
    <button className="btn burger" aria-label="Menu" aria-expanded={o} onClick={() => setO(!o)} style={{ padding: 0, width: 44 }}>{o ? <X size={20} /> : <Menu size={20} />}</button></div></header>
    <div className={'drawer' + (o ? ' open' : '')}>{L.map(([h, l]) => <Link key={h} href={to(h)} className="l" onClick={() => setO(false)}>{l}</Link>)}
      {user ? <Link href={to('/dashboard')} className="btn p lg" onClick={() => setO(false)}>Tableau de bord</Link> : <><Link href={to('/login')} className="btn lg" onClick={() => setO(false)}>Connexion</Link><Link href={to('/register')} className="btn p lg" onClick={() => setO(false)}>Créer un compte</Link></>}</div></>;
}
export function Footer({ base = '' }: { base?: string }) {
  const b = useBase(base); const to = (h: string) => (h.startsWith('/') ? b + h : h);
  return <footer className="foot"><div className="in2"><div className="cols">
    <div><div className="logo" style={{ color: '#fff', marginBottom: 16 }}><LogoMark />Coinvera</div><p style={{ maxWidth: 340 }}>Encaissez par carte, retirez en cryptomonnaie. La plateforme de paiement pensée pour les marchands et les développeurs.</p><div style={{ marginTop: 16 }}><CardLogos /></div></div>
    <div><h4>Produit</h4><ul><li><Link href={to('/features')}>Fonctionnalités</Link></li><li><Link href={to('/cartes')}>Cartes virtuelles</Link></li><li><Link href={to('/pricing')}>Tarification</Link></li><li><Link href={to('/woocommerce')}>Plugin WooCommerce</Link></li><li><Link href={to('/dons')}>Plugin de dons</Link></li><li><Link href={to('/factures')}>Plugin de factures</Link></li><li><Link href={to('/abonnements')}>Plugin d’abonnements</Link></li><li><Link href={to('/billetterie')}>Plugin de billetterie</Link></li></ul></div>
    <div><h4>Développeurs</h4><ul><li><a href={DOCS}>Documentation API</a></li><li><a href={HELP}>Centre d’aide</a></li><li><a href={STATUS}>État des services</a></li><li><Link href={to('/register')}>Créer un compte</Link></li></ul></div>
    <div><h4>Entreprise</h4><ul><li><Link href={to('/contact')}>Contact</Link></li><li><a href="mailto:support@coinvera.me">support@coinvera.me</a></li><li><Link href={to('/login')}>Connexion</Link></li></ul></div>
    <div><h4>Légal</h4><ul><li><Link href={to('/terms')}>Conditions d’utilisation</Link></li><li><Link href={to('/privacy')}>Confidentialité</Link></li><li><Link href={to('/refund-policy')}>Remboursement</Link></li></ul></div></div>
    <div className="risk"><p style={{ margin: 0 }}><b style={{ color: '#fff' }}>Avertissement sur les risques.</b> Les cryptomonnaies sont volatiles et comportent des risques de perte, de changement réglementaire et de défaillance technique. Les transactions sont irréversibles. Coinvera LLC n’est pas une banque et ne fournit pas de conseil en investissement.</p>
      <div className="bar2"><span>© {new Date().getFullYear()} Coinvera LLC. Tous droits réservés.</span><span>www.coinvera.me</span></div></div></div></footer>;
}
