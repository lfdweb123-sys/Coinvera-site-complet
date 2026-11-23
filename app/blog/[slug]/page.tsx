import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Clock } from 'lucide-react';
import { Header, Footer } from '@/components/Site';
import PageHero from '@/components/PageHero';
import CtaLink from '@/components/Cta';
import { seo } from '@/lib/seo';
import { POSTS, bySlug, fdate } from '@/lib/blog';
import { SITE } from '@/lib/site';
export const dynamicParams = false;
export function generateStaticParams() { return POSTS.map(p => ({ slug: p.slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const p = bySlug((await params).slug); if (!p) return {};
  const m = seo({ title: p.title, path: '/blog/' + p.slug, description: p.description, keywords: p.keywords });
  return { ...m, openGraph: { ...m.openGraph, type: 'article', publishedTime: p.date, authors: ['Coinvera'] } } as typeof m;
}
export default async function Post({ params }: { params: Promise<{ slug: string }> }) {
  const p = bySlug((await params).slug); if (!p) notFound();
  const url = SITE + '/blog/' + p.slug, others = POSTS.filter(o => o.slug !== p.slug).slice(0, 3);
  const ld = [{ '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, description: p.description, datePublished: p.date, dateModified: p.date, inLanguage: 'fr', mainEntityOfPage: url, keywords: p.keywords.join(', '), author: { '@type': 'Organization', name: 'Coinvera', url: SITE }, publisher: { '@type': 'Organization', name: 'Coinvera LLC', logo: { '@type': 'ImageObject', url: SITE + '/icon.svg' } } },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [['Accueil', SITE], ['Blog', SITE + '/blog'], [p.title, url]].map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })) }];
  return <><Header />{ld.map((j, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(j) }} />)}
    <PageHero v={1} eyebrow={p.cat} title={p.title} sub={`${fdate(p.date)} · ${p.min} min de lecture`} />
    <main className="sec"><div className="wrap"><article className="card post"><nav className="crumb" aria-label="Fil d’Ariane"><Link href="/">Accueil</Link> / <Link href="/blog">Blog</Link></nav>
      <p className="plead">{p.intro}</p>{p.sections.map(s => <section key={s.h}><h2>{s.h}</h2>{s.p.map((t, i) => <p key={i}>{t}</p>)}{s.ul && <ul>{s.ul.map(li => <li key={li}>{li}</li>)}</ul>}</section>)}
      <div className="pmore"><h3>Pour aller plus loin</h3><div className="chips">{p.more.map(([h, l]) => h.startsWith('http') ? <a className="chip" key={h} href={h}>{l}</a> : <Link className="chip" key={h} href={h}>{l}</Link>)}</div></div>
      <div className="pcta"><CtaLink className="btn p lg" guest={['/register', 'Créer un compte gratuitement']} user={['/dashboard', 'Tableau de bord']}><ArrowRight size={18} /></CtaLink></div></article>
      <section className="prel"><h2>À lire aussi</h2><div className="g3">{others.map(o => <article className="card pcard" key={o.slug}><div><span className="badge info">{o.cat}</span></div><h3><Link href={'/blog/' + o.slug}>{o.title}</Link></h3><div className="pmeta"><span><Clock size={14} /> {o.min} min</span></div></article>)}</div></section></div></main><Footer /></>;
}
