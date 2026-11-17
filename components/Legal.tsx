import { Header, Footer } from '@/components/Site';
import PageHero from '@/components/PageHero';
import type { Doc } from '@/lib/legal';
export default function Legal({ d, v = 1 }: { d: Doc; v?: number }) {
  return <><Header /><PageHero v={v} eyebrow="Légal" title={d.title} sub={`Dernière mise à jour : ${d.updated}`} /><main className="sec"><div className="wrap legal">
    <aside aria-label="Sommaire">{d.sections.map(([h], i) => <a key={h} href={'#s' + i}>{h}</a>)}</aside>
    <div className="card" style={{ padding: 'clamp(20px,4vw,44px)' }}><p style={{ fontSize: 17, color: 'var(--ink2)', marginBottom: 30 }}>{d.intro}</p>{d.sections.map(([h, ps], i) => <section key={h} id={'s' + i}><h2>{h}</h2>{ps.map((p, j) => <p key={j}>{p}</p>)}</section>)}</div></div></main><Footer /></>;
}
