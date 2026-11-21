'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { ArrowLeftRight, BadgeCheck, Bell, CreditCard, FileBarChart, HelpCircle, KeyRound, LayoutDashboard, LifeBuoy, Link2, LogOut, Menu, PanelLeft, ScrollText, Settings, ShieldCheck, Store, Tag, Users, Wallet, Webhook, ChevronDown, Lock, Landmark, UserCog, Ellipsis, Coins } from 'lucide-react';
import { api, auth, msg, usePending } from '@/lib/client';
import { LogoMark } from '@/components/Illustrations';
import { PageLoader } from '@/components/Loader';
import AuthShell from '@/components/AuthShell';
import IdleLogout from '@/components/IdleLogout';
import OtpInput from '@/components/OtpInput';
import { HELP } from '@/lib/site';
const ICONS: Record<string, any> = { dash: LayoutDashboard, tx: ArrowLeftRight, pay: CreditCard, link: Link2, wd: Landmark, bal: Wallet, key: KeyRound, shop: Store, hook: Webhook, rep: FileBarChart, help: LifeBuoy, set: UserCog, users: Users, shield: ShieldCheck, log: ScrollText, bell: Bell, tag: Tag, badge: BadgeCheck, coin: Coins };
export type NavItem = { href: string; label: string; icon: string; superOnly?: boolean };
export type NavGroup = { title: string; items: NavItem[] };
export default function Shell({ groups, admin, quick, children }: { groups: NavGroup[]; admin?: boolean; quick: string[]; children: React.ReactNode }) {
  const path = usePathname(), r = useRouter(); const pending = usePending();
  const [u, setU] = useState<User | null>(null), [me, setMe] = useState<any>(null), [col, setCol] = useState(false), [mob, setMob] = useState(false), [menu, setMenu] = useState(false), [bell, setBell] = useState(false), [notes, setNotes] = useState<any[]>([]), [settled, setSettled] = useState('');
  const [opened, setOpened] = useState<Record<string, boolean>>({}), [mc, setMc] = useState(''), [mErr, setMErr] = useState(''), [mBusy, setMBusy] = useState(false);
  const refMenu = useRef<HTMLDivElement>(null), refBell = useRef<HTMLDivElement>(null);
  useEffect(() => onAuthStateChanged(auth, async x => {
    if (!x) { r.replace('/login'); return; }
    if (!x.emailVerified) { r.replace('/verify-email'); return; }
    if (admin && (await x.getIdTokenResult()).claims.role !== 'admin') { r.replace('/dashboard'); return; }
    try { const m = await api('/api/me'); if (!admin && m.admin) { r.replace('/admin'); return; } setMe(m); setU(x); } catch { await signOut(auth); r.replace('/login'); }
  }), [admin, r]);
  useEffect(() => { if (me && (!me.twoFactor || me.mfa)) api('/api/notifications').then(d => setNotes(d.items)).catch(() => {}); }, [me]);
  useEffect(() => { setMob(false); setMenu(false); setBell(false); setSettled(path); }, [path]);
  // ferme les fenetres flottantes au clic dans le vide ou avec Echap
  useEffect(() => { const down = (e: MouseEvent | TouchEvent) => { const t = e.target as Node; if (menu && !refMenu.current?.contains(t)) setMenu(false); if (bell && !refBell.current?.contains(t)) setBell(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenu(false); setBell(false); } };
    document.addEventListener('mousedown', down); document.addEventListener('touchstart', down); document.addEventListener('keydown', key); return () => { document.removeEventListener('mousedown', down); document.removeEventListener('touchstart', down); document.removeEventListener('keydown', key); }; }, [menu, bell]);
  const expire = useCallback(async () => { try { sessionStorage.setItem('cv_expired', '1'); } catch {} await signOut(auth); r.replace('/login'); }, [r]);
  if (!u || !me) return <PageLoader full />;
  if (me.twoFactor && !me.mfa) return <AuthShell title="Vérification en deux étapes" sub="Saisissez le code à 6 chiffres affiché par votre application d’authentification.">
    <OtpInput value={mc} onChange={setMc} invalid={!!mErr} disabled={mBusy} onComplete={async c => { setMBusy(true); setMErr(''); try { await api('/api/2fa/verify', { method: 'POST', body: JSON.stringify({ code: c }) }); setMe({ ...me, mfa: true }); } catch (e) { setMErr(msg(e)); setMc(''); } setMBusy(false); }} />
    {mErr && <div className="err" role="alert" style={{ marginTop: 12 }}>{mErr}</div>}<p className="mut" style={{ marginTop: 18 }}><a href="#" onClick={async e => { e.preventDefault(); await signOut(auth); r.replace('/login'); }}>Se déconnecter</a></p></AuthShell>;
  groups = groups.map(g => ({ ...g, items: g.items.filter(n => !n.superOnly || me.superAdmin) }));
  const all = groups.flatMap(g => g.items);
  const name = u.displayName || u.email || ''; const root = admin ? '/admin' : '/dashboard'; const on = (h: string) => h === root ? path === h : path.startsWith(h);
  const out = async () => { await signOut(auth); r.replace('/login'); };
  return <div className="app"><IdleLogout onExpire={expire} />
    <div className={'scrim' + (mob ? ' on' : '')} onClick={() => setMob(false)} />
    <nav className={'side' + (col ? ' col' : '') + (mob ? ' mob' : '')} aria-label="Navigation principale">
      <Link href="/" className="logo"><LogoMark s={32} /><span>{admin ? 'Coinvera Admin' : 'Coinvera'}</span></Link>
      <div className="scroll">{groups.map((g, gi) => { const isOpen = !!opened[g.title], has = g.items.some(n => on(n.href)), id = 'grp-' + gi; return <div key={g.title} className="gw"><button type="button" className={'gh' + (has ? ' has' : '') + (isOpen ? ' open' : '')} aria-expanded={isOpen} aria-controls={id} onClick={() => setOpened({ ...opened, [g.title]: !isOpen })}><span>{g.title}</span><ChevronDown size={15} /></button>
        <div id={id} className={'gi' + (isOpen ? '' : ' shut')}>{g.items.map(n => { const I = ICONS[n.icon] ?? LayoutDashboard; return <Link key={n.href} href={n.href} className={'it' + (on(n.href) ? ' on' : '')} title={n.label} aria-current={on(n.href) ? 'page' : undefined}><I size={19} /><span className="t">{n.label}</span></Link>; })}</div></div>; })}</div>
      <div className="bot"><button onClick={out} title="Déconnexion"><LogOut size={18} /><span className="t">Déconnexion</span></button><p>© {new Date().getFullYear()} COINVERA</p></div>
    </nav>
    <div className={'main' + (col ? ' col' : '')}>
      <header className="top">
        <div style={{ display: 'flex', gap: 8 }}><button className="btn sm burger-d" aria-label="Ouvrir le menu" onClick={() => setMob(true)}><Menu size={18} /></button><button className="btn sm hide-m" aria-label="Réduire la barre latérale" onClick={() => setCol(!col)}><PanelLeft size={18} /></button></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <a className="btn sm" href={HELP} target="_blank" rel="noreferrer" aria-label="Centre d’aide" title="Centre d’aide"><HelpCircle size={18} /></a>
          <div ref={refBell} style={{ position: 'relative' }}><button className="btn sm" aria-label="Notifications" aria-expanded={bell} onClick={() => { setBell(!bell); setMenu(false); }}><Bell size={18} />{notes.length > 0 && <span className="badge info" style={{ padding: '0 7px' }}>{notes.length}</span>}</button>
            {bell && <div className="pop" style={{ width: 'min(320px,86vw)' }}>{notes.length ? notes.map(n => <div key={n.id} style={{ padding: '8px 10px', fontSize: 14 }}><b>{n.title}</b><div className="mut">{n.body}</div></div>) : <div className="empty" style={{ padding: 24 }}>Aucune notification</div>}</div>}</div>
          <div ref={refMenu} style={{ position: 'relative' }}><button onClick={() => { setMenu(!menu); setBell(false); }} aria-haspopup="menu" aria-expanded={menu} style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'none', border: 0, cursor: 'pointer', font: 'inherit', padding: 0 }}>
            {u.photoURL ? <img src={u.photoURL} alt="" className="av" /> : <span className="av">{name[0]?.toUpperCase()}</span>}<span className="uinfo hide-m"><b style={{ fontSize: 14 }}>{name}</b><br /><span className="mut" style={{ fontSize: 12 }}>{u.email}</span></span><ChevronDown size={16} className="hide-m" /></button>
            {menu && <div className="pop" role="menu"><div style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)', marginBottom: 6 }}><b style={{ fontSize: 14 }}>{name}</b><div className="mut" style={{ fontSize: 12 }}>{u.email}</div></div>
              {!admin && <><Link href="/dashboard/settings"><Settings size={15} style={{ verticalAlign: -3, marginRight: 8 }} />Paramètres et profil</Link><Link href="/dashboard/settings?tab=2fa"><Lock size={15} style={{ verticalAlign: -3, marginRight: 8 }} />Sécurité</Link></>}
              <button onClick={out}><LogOut size={15} style={{ verticalAlign: -3, marginRight: 8 }} />Déconnexion</button></div>}</div>
        </div>
      </header>
      <div className="page">{(settled !== path || pending > 0) && <PageLoader />}<div style={{ display: settled !== path || pending > 0 ? 'none' : 'block' }}>{children}</div></div>
    </div>
    <nav className="bnav" aria-label="Menu rapide">{quick.map(h => { const n = all.find(x => x.href === h)!; const I = ICONS[n.icon] ?? LayoutDashboard; return <Link key={h} href={h} className={on(h) ? 'on' : ''}><I size={20} />{n.label.split(' ')[0]}</Link>; })}<button onClick={() => setMob(true)}><Ellipsis size={20} />Menu</button></nav>
  </div>;
}
