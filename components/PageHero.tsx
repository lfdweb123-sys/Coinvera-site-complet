import { BannerArt } from '@/components/Art';
export default function PageHero({ eyebrow, title, sub, v = 0 }: { eyebrow: string; title: string; sub?: string; v?: number }) {
  return <section className="phero on-dark"><BannerArt v={v} /><div className="wrap"><span className="ey on">{eyebrow}</span><h1>{title}</h1>{sub && <p className="lead">{sub}</p>}</div></section>;
}
