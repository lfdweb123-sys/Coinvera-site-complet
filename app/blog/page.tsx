import Link from 'next/link';
import { ArrowRight, Clock } from 'lucide-react';
import { Header, Footer } from '@/components/Site';
import PageHero from '@/components/PageHero';
import { seo } from '@/lib/seo';
import { POSTS, fdate } from '@/lib/blog';
import { SITE } from '@/lib/site';
export const metadata = seo({ title: 'Blog : paiement par carte, USDT, WooCommerce et API', path: '/blog', description: 'Guides pratiques Coinvera : accepter les paiements par carte, retirer en USDT, plugin WooCommerce, webhooks, anti-fraude et cartes virtuelles.', keywords: ['blog paiement en ligne', 'guide paiement par carte', 'tutoriel WooCommerce', 'guide USDT', 'API de paiement tutoriel'] });
export default function Blog() {
  const ld = { '@context': 'https://schema.org', '@type': 'Blog', name: 'Blog Coinvera', url: SITE + '/blog', inLanguage: 'fr', blogPost: POSTS.map(p => ({ '@type': 'BlogPosting', headline: p.title, url: SITE + '/blog/' + p.slug, datePublished: p.date })) };
  return <><Header /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
    <PageHero v={1} eyebrow="Blog" title="Guides et conseils pour encaisser en ligne" sub="Paiement par carte, retraits USDT, plugins WordPress, API et sécurité : des articles concrets pour les marchands et les développeurs." />
    <main className="sec"><div className="wrap"><div className="g3">{POSTS.map(p => <article className="card pcard" key={p.slug}><div><span className="badge info">{p.cat}</span></div><h2><Link href={'/blog/' + p.slug}>{p.title}</Link></h2><p className="mut">{p.description}</p>
      <div className="pmeta"><span>{fdate(p.date)}</span><span><Clock size={14} /> {p.min} min de lecture</span></div><Link className="btn" href={'/blog/' + p.slug}>Lire l’article <ArrowRight size={16} /></Link></article>)}</div></div></main><Footer /></>;
}
