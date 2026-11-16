import { Header, Footer } from '@/components/Site';
import PageHero from '@/components/PageHero';
import type { Doc } from '@/lib/legal';
export default function Legal({ d }: { d: Doc }) {
  return <><Header /><PageHero eyebrow="Légal" title={d.title} sub={`Dernière mise à jour : ${d.updated}`} /><main className="wrap sec" style={{ maxWidth: 860, paddingTop: 40 }}>
    <div className="card flat" style={{ padding: 'clamp(20px,4vw,40px)' }}>{d.sections.map(([h, ps]) => <section key={h} style={{ marginBottom: 28 }}><h2 style={{ fontSize: 22, marginBottom: 10 }}>{h}</h2>{ps.map((p, i) => <p key={i} style={{ color: 'var(--ink2)' }}>{p}</p>)}</section>)}</div></main><Footer /></>;
}
