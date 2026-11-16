export default function PageHero({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return <section className="hero" style={{ padding: '56px 0 48px' }}><div className="wrap" style={{ display: 'block', maxWidth: 820 }}><span className="eyebrow">{eyebrow}</span><h1 style={{ fontSize: 'clamp(32px,4.6vw,48px)' }}>{title}</h1>{sub && <p className="lead" style={{ marginTop: 14 }}>{sub}</p>}</div></section>;
}
