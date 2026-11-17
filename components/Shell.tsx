'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { onAuthStateChanged, sendEmailVerification, signOut, User } from 'firebase/auth';
import { Activity, ArrowLeftRight, ArrowUpFromLine, BadgeCheck, Bell, BookOpen, CreditCard, FileBarChart, KeyRound, LayoutDashboard, LifeBuoy, LogOut, Menu, PanelLeft, ScrollText, Settings, ShieldCheck, Store, Tag, Users, Wallet, Webhook, ChevronDown, Lock, Landmark, UserCog, Ellipsis } from 'lucide-react';
import { api, auth } from '@/lib/client';
import { LogoMark } from '@/components/Illustrations';
import { DOCS, STATUS } from '@/lib/site';
const ICONS: Record<string, any> = { dash: LayoutDashboard, tx: ArrowLeftRight, pay: CreditCard, wd: Landmark, bal: Wallet, key: KeyRound, shop: Store, hook: Webhook, rep: FileBarChart, help: LifeBuoy, set: UserCog, users: Users, shield: ShieldCheck, log: ScrollText, bell: Bell, tag: Tag, badge: BadgeCheck, out: ArrowUpFromLine };
export type NavItem = { href: string; label: string; icon: string };
export type NavGroup = { title: string; items: NavItem[] };
export default function Shell({ groups, admin, quick, children }: { groups: NavGroup[]; admin?: boolean; quick: string[]; children: React.ReactNode }) {
  const path = usePathname(), r = useRouter(); const all = groups.flatMap(g => g.items);
  const [u, setU] = useState<User | null>(null), [ready, setReady] = useState(false), [col, setCol] = useState(false), [mob, setMob] = useState(false);
  const [menu, setMenu] = useState(false), [bell, setBell] = useState(false), [notes, setNotes] = useState<any[]>([]), [sent, setSent] = useState(false);
  useEffect(() => onAuthStateChanged(auth, async x => {
    if (!x) { r.replace('/login'); return; }
    if (admin && (await x.getIdTokenResult()).claims.role !== 'admin') { r.replace('/dashboard'); return; }
    setU(x); setReady(true); api('/api/notifications').then(d => setNotes(d.items)).catch(() => {});
  }), [admin, r]);
  useEffect(() => { setMob(false); setMenu(false); setBell(false); }, [path]);
  if (!ready || !u) return <div className="center">Chargement…</div>;
  if (!u.emailVerified) return <div className="center" style={{ padding: 20 }}><div className="card" style={{ maxWidth: 440 }}><h2 style={{ marginBottom: 8, fontSize: 26 }}>Vérifiez votre adresse email</h2>
    <p className="mut">Un lien de confirmation a été envoyé à {u.email}. Cliquez dessus puis continuez.</p>
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><button className="btn" onClick={async () => { await sendEmailVerification(u); setSent(true); }}>Renvoyer l’email</button>
      <button className="btn p" onClick={async () => { await u.reload(); await u.getIdToken(true); location.reload(); }}>J’ai vérifié</button></div>{sent && <p className="okm">Email envoyé.</p>}</div></div>;
  const name = u.displayName || u.email || ''; const root = admin ? '/admin' : '/dashboard';
  const on = (h: string) => h === root ? path === h : path.startsWith(h);
  return <div className="app">
    <div className={'scrim' + (mob ? ' on' : '')} onClick={() => setMob(false)} />
    <nav className={'side' + (col ? ' col' : '') + (mob ? ' mob' : '')} aria-label="Navigation principale">
      <Link href="/" className="logo"><LogoMark s={32} /><span>{admin ? 'Coinvera Admin' : 'Coinvera'}</span></Link>
      <div className="scroll">{groups.map(g => <div key={g.title}><div className="grp">{g.title}</div>{g.items.map(n => { const I = ICONS[n.icon] ?? LayoutDashboard; return <Link key={n.href} href={n.href} className={'it' + (on(n.href) ? ' on' : '')} title={n.label} aria-current={on(n.href) ? 'page' : undefined}><I size={19} /><span className="t">{n.label}</span></Link>; })}</div>)}</div>
      <div className="bot"><a href={DOCS} target="_blank" rel="noreferrer" title="Documentation API"><BookOpen size={18} /><span className="t">Documentation API</span></a><a href={STATUS} target="_blank" rel="noreferrer" title="État des services"><Activity size={18} /><span className="t">État des services</span></a>
        <button onClick={async () => { await signOut(auth); r.replace('/login'); }} title="Déconnexion"><LogOut size={18} /><span className="t">Déconnexion</span></button><p>© {new Date().getFullYear()} COINVERA</p></div>
    </nav>
    <div className={'main' + (col ? ' col' : '')}>
      <header className="top">
        <div style={{ display: 'flex', gap: 8 }}><button className="btn sm burger-d" aria-label="Ouvrir le menu" onClick={() => setMob(true)}><Menu size={18} /></button>
          <button className="btn sm hide-m" aria-label="Réduire la barre latérale" onClick={() => setCol(!col)}><PanelLeft size={18} /></button></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', position: 'relative' }}>
          <button className="btn sm" aria-label="Notifications" onClick={() => { setBell(!bell); setMenu(false); }}><Bell size={18} />{notes.length > 0 && <span className="badge info" style={{ padding: '0 7px' }}>{notes.length}</span>}</button>
          {bell && <div className="pop" style={{ width: 'min(320px,86vw)', right: 56 }}>{notes.length ? notes.map(n => <div key={n.id} style={{ padding: '8px 10px', fontSize: 14 }}><b>{n.title}</b><div className="mut">{n.body}</div></div>) : <div className="empty" style={{ padding: 24 }}>Aucune notification</div>}</div>}
          <button onClick={() => { setMenu(!menu); setBell(false); }} aria-haspopup="menu" aria-expanded={menu} style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'none', border: 0, cursor: 'pointer', font: 'inherit', padding: 0 }}>
            {u.photoURL ? <img src={u.photoURL} alt="" className="av" /> : <span className="av">{name[0]?.toUpperCase()}</span>}
            <span className="uinfo hide-m"><b style={{ fontSize: 14 }}>{name}</b><br /><span className="mut" style={{ fontSize: 12 }}>{u.email}</span></span><ChevronDown size={16} className="hide-m" /></button>
          {menu && <div className="pop" role="menu"><div style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)', marginBottom: 6 }}><b style={{ fontSize: 14 }}>{name}</b><div className="mut" style={{ fontSize: 12 }}>{u.email}</div></div>
            {!admin && <><Link href="/dashboard/settings"><Settings size={15} style={{ verticalAlign: -3, marginRight: 8 }} />Paramètres et profil</Link><Link href="/dashboard/settings?tab=password"><Lock size={15} style={{ verticalAlign: -3, marginRight: 8 }} />Sécurité</Link></>}
            <button onClick={async () => { await signOut(auth); r.replace('/login'); }}><LogOut size={15} style={{ verticalAlign: -3, marginRight: 8 }} />Déconnexion</button></div>}
        </div>
      </header>
      <div className="page">{children}</div>
    </div>
    <nav className="bnav" aria-label="Menu rapide">{quick.map(h => { const n = all.find(x => x.href === h)!; const I = ICONS[n.icon] ?? LayoutDashboard; return <Link key={h} href={h} className={on(h) ? 'on' : ''}><I size={20} />{n.label.split(' ')[0]}</Link>; })}<button onClick={() => setMob(true)}><Ellipsis size={20} />Menu</button></nav>
  </div>;
}
