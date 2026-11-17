export default function SectionTitle({ eyebrow, title, em, sub, center }: { eyebrow: string; title: string; em?: string; sub?: string; center?: boolean }) {
  return <div className={'stt' + (center ? ' c' : '')}><span className="ey">{eyebrow}</span><h2>{title}{em && <> <em>{em}</em></>}</h2>{sub && <p>{sub}</p>}</div>;
}
