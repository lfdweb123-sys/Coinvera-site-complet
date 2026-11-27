'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Activity, ChevronDown, CreditCard, KeyRound, Landmark, LifeBuoy, Lock, Menu, ShieldCheck, User, UserCheck, X } from 'lucide-react';
import { LogoMark } from '@/components/Illustrations';
import { CardLogos } from '@/components/Logos';
import CryptoStrip from '@/components/CryptoStrip';
import Socials from '@/components/Socials';
import ThemeSwitch from '@/components/ThemeSwitch';
import InstallApp from '@/components/InstallApp';
import PublicChat from '@/components/PublicChat';
import { useAuthUser } from '@/lib/client';
import { DOCS, HELP, SITE, STATUS } from '@/lib/site';
const L = [['#produits', 'Produits'], ['/features', 'Fonctionnalités'], ['/cartes', 'Cartes'], ['/pricing', 'Tarification'], ['/plugins', 'Plugins'], [DOCS, 'Documentation'], ['/contact', 'Contact']];
// Depuis docs.*, status.* ou helpcenter.*, un lien relatif (/pricing) resterait sur le sous-domaine, où il est réécrit vers la page du sous-domaine :
// les liens internes du header et du footer pointent donc vers le site principal, page exacte comprise. Sur le site principal (ou en local) ils restent relatifs.
// Sous-menus du header : la clé est un lien du menu principal, la valeur la liste de ses sous-liens (aussi affichés en retrait dans le menu mobile).
const SUBMENU: Record<string, [string, string][]> = {
  '#produits': [['/numeros-virtuels', 'Numéros WhatsApp et Telegram'], ['/proxnum', 'Numéros virtuels ProxNum'], ['/esim', 'eSIM de voyage']],
  '/features': [['/features', 'Toutes les fonctionnalités'], ['/couverture', 'Couverture mondiale'], ['/numeros-virtuels', 'Numéros WhatsApp et Telegram'], ['/proxnum', 'Numéros virtuels ProxNum'], ['/esim', 'eSIM de voyage']],
  '/plugins': [['/woocommerce', 'Plugin WooCommerce'], ['/dons', 'Plugin de dons'], ['/factures', 'Plugin de factures'], ['/abonnements', 'Plugin d’abonnements'], ['/billetterie', 'Plugin de billetterie'], ['/anti-fraude', 'Plugin anti-fraude'], ['/facturation-electronique', 'Plugin facturation électronique'], ['/relances-whatsapp', 'Plugin relances WhatsApp'], ['/retours', 'Plugin retours & échanges'], ['/paiement-livraison', 'Plugin paiement à la livraison'], ['/paiement-en-plusieurs-fois', 'Plugin paiement en plusieurs fois']],
};
const SUB = /^(docs|status|helpcenter|api)\./i;
function useBase(base: string) { const [b, setB] = useState(base); useEffect(() => { setB(SUB.test(window.location.hostname) ? SITE : ''); }, []); return b; }
export function Header({ base = '' }: { base?: string }) {
  const b = useBase(base); const to = (h: string) => (h.startsWith('/') ? b + h : h);
  const [o, setO] = useState(false), [sub, setSub] = useState<string | null>(null); const path = usePathname(); const { user } = useAuthUser();
  const cta = user ? <Link href={to('/dashboard')} className="btn p">Tableau de bord</Link> : <><Link href={to('/login')} className="btn">Connexion</Link><Link href={to('/register')} className="btn p">Créer un compte</Link></>;
  return <><header className="hdr"><div className="bar"><Link href={to('/')} className="logo" aria-label="Coinvera, accueil"><LogoMark />Coinvera</Link>
    <nav className="nav" aria-label="Navigation principale">{L.map(([h, l]) => SUBMENU[h]
      ? <div key={h} className="dd">{h.startsWith('#') ? <button type="button" className={'l' + (SUBMENU[h].some(([x]) => x === path) ? ' on' : '')} aria-haspopup="true">{l}<ChevronDown size={14} aria-hidden="true" /></button> : <Link href={to(h)} className={'l' + (path === h || SUBMENU[h].some(([x]) => x === path) ? ' on' : '')} aria-haspopup="true">{l}<ChevronDown size={14} aria-hidden="true" /></Link>}<div className="ddm" role="menu">{SUBMENU[h].map(([x, y]) => <Link key={x} href={to(x)} role="menuitem" className={path === x ? 'on' : ''}>{y}</Link>)}</div></div>
      : <Link key={h} href={to(h)} className={'l' + (path === h ? ' on' : '')}>{l}</Link>)}</nav>
    <div className="hdr-cta">{cta}</div>
    <div className="mob-r"><Link href={to(user ? '/dashboard' : '/login')} className="avm" aria-label={user ? 'Mon tableau de bord' : 'Connexion'} title={user ? 'Tableau de bord' : 'Connexion'}><User size={20} aria-hidden="true" /></Link>
      <button className="btn burger" aria-label="Menu" aria-expanded={o} onClick={() => setO(!o)} style={{ padding: 0, width: 44 }}>{o ? <X size={20} /> : <Menu size={20} />}</button></div></div></header>
    <div className={'drawer' + (o ? ' open' : '')}>{L.map(([h, l]) => SUBMENU[h]
      ? <div key={h} className="dr-dd"><div className="dr-row">{h.startsWith('#') ? <button type="button" className="l" aria-expanded={sub === h} onClick={() => setSub(sub === h ? null : h)}>{l}</button> : <Link href={to(h)} className="l" onClick={() => setO(false)}>{l}</Link>}<button type="button" className="dr-tgl" aria-label={`Sous-menu ${l}`} aria-expanded={sub === h} onClick={() => setSub(sub === h ? null : h)}><ChevronDown size={18} aria-hidden="true" /></button></div>
        {sub === h && <div className="dr-ddm" role="menu">{SUBMENU[h].map(([x, y]) => <Link key={x} href={to(x)} role="menuitem" className={path === x ? 'on' : ''} onClick={() => setO(false)}>{y}</Link>)}</div>}</div>
      : <Link key={h} href={to(h)} className="l" onClick={() => setO(false)}>{l}</Link>)}
      {user ? <Link href={to('/dashboard')} className="btn p lg" onClick={() => setO(false)}>Tableau de bord</Link> : <><Link href={to('/login')} className="btn lg" onClick={() => setO(false)}>Connexion</Link><Link href={to('/register')} className="btn p lg" onClick={() => setO(false)}>Créer un compte</Link></>}</div></>;
}
// Éléments de confiance : chaque ligne décrit une mesure réellement en place (voir lib/legal.ts, l'API signée, la double authentification, le registre des soldes).
const TRUST: [typeof ShieldCheck, string, string][] = [
  [ShieldCheck, 'API signée', 'Chaque requête est signée (HMAC-SHA256), avec horodatage et nonce unique.'],
  [KeyRound, 'Double authentification', 'Protégez votre compte avec un code à usage unique (TOTP).'],
  [Lock, 'Connexion chiffrée', 'Site, tableau de bord et API servis uniquement en HTTPS.'],
  [Landmark, 'Soldes séparés', 'Un registre comptable distinct pour chaque marchand.'],
  [CreditCard, 'Visa et Mastercard', 'Authentification du porteur de carte lorsqu’elle est disponible.'],
  [UserCheck, 'Sans vérification d’identité', 'Ouvrez un compte et encaissez sans KYC, sauf pour la carte virtuelle Pro.'],
  [Activity, 'État des services public', 'Consultez à tout moment la disponibilité de la plateforme.'],
  [LifeBuoy, 'Support et aide', 'Support joignable par e-mail et centre d’aide en libre accès.'],
];
function TrustBar() {
  return <section className="tsec" aria-labelledby="trust-t"><div className="in2"><h2 id="trust-t">Pourquoi nous faire confiance</h2><ul>{TRUST.map(([I, t, d]) => <li key={t}><span className="tf-i"><I size={18} aria-hidden="true" /></span><div><b>{t}</b><p>{d}</p></div></li>)}</ul></div></section>;
}
export function Footer({ base = '' }: { base?: string }) {
  const b = useBase(base); const to = (h: string) => (h.startsWith('/') ? b + h : h);
  return <><CryptoStrip /><TrustBar /><footer className="foot"><div className="in2"><div className="cols">
    <div><div className="logo" style={{ color: '#fff', marginBottom: 16 }}><LogoMark />Coinvera</div><p style={{ maxWidth: 340 }}>Encaissez par carte, retirez en cryptomonnaie. La plateforme de paiement pensée pour les marchands et les développeurs.</p><div style={{ marginTop: 16 }}><CardLogos /></div></div>
    <div><h4>Produit</h4><ul><li><Link href={to('/features')}>Fonctionnalités</Link></li><li><Link href={to('/cartes')}>Cartes virtuelles</Link></li><li><Link href={to('/numeros-virtuels')}>Numéros WhatsApp et Telegram</Link></li><li><Link href={to('/proxnum')}>Numéros virtuels ProxNum</Link></li><li><Link href={to('/esim')}>eSIM de voyage</Link></li><li><Link href={to('/pricing')}>Tarification</Link></li><li><Link href={to('/woocommerce')}>Plugin WooCommerce</Link></li><li><Link href={to('/dons')}>Plugin de dons</Link></li><li><Link href={to('/factures')}>Plugin de factures</Link></li><li><Link href={to('/abonnements')}>Plugin d’abonnements</Link></li><li><Link href={to('/billetterie')}>Plugin de billetterie</Link></li><li><Link href={to('/paiement-livraison')}>Plugin paiement à la livraison</Link></li><li><Link href={to('/paiement-en-plusieurs-fois')}>Plugin paiement en plusieurs fois</Link></li></ul></div>
    <div><h4>Développeurs</h4><ul><li><a href={DOCS}>Documentation API</a></li><li><a href={HELP}>Centre d’aide</a></li><li><a href={STATUS}>État des services</a></li><li><Link href={to('/couverture')}>Couverture mondiale</Link></li><li><Link href={to('/blog')}>Blog</Link></li><li><Link href={to('/register')}>Créer un compte</Link></li></ul></div>
    <div><h4>Entreprise</h4><ul><li><Link href={to('/contact')}>Contact</Link></li><li><a href="mailto:support@coinvera.me">support@coinvera.me</a></li><li><Link href={to('/login')}>Connexion</Link></li></ul></div>
    <div><h4>Légal</h4><ul><li><Link href={to('/terms')}>Conditions d’utilisation</Link></li><li><Link href={to('/privacy')}>Confidentialité</Link></li><li><Link href={to('/refund-policy')}>Remboursement</Link></li></ul></div></div>
    <div className="risk"><p style={{ margin: 0 }}><b style={{ color: '#fff' }}>Avertissement sur les risques.</b> Les cryptomonnaies sont volatiles et comportent des risques de perte, de changement réglementaire et de défaillance technique. Les transactions sont irréversibles. Coinvera LLC n’est pas une banque et ne fournit pas de conseil en investissement.</p>
      <div className="bar2"><div className="foot-l"><InstallApp /><span>© {new Date().getFullYear()} Coinvera LLC. Tous droits réservés.</span></div><span style={{ display: 'inline-flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}><ThemeSwitch mini /><Socials /></span></div></div></div></footer>{b === '' && <PublicChat />}</>;
}
