import type { ComponentType, ReactNode } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { Header, Footer } from '@/components/Site';
import PageHero from '@/components/PageHero';
import CtaLink from '@/components/Cta';
import { CardLogos } from '@/components/Logos';

type Icon = ComponentType<{ size?: number }>;
export type PluginPageProps = {
  v?: number; eyebrow: string; title: string; sub: string; price: number;
  features: readonly (readonly [Icon, string, string])[];
  steps: readonly (readonly [string, string])[];
  bullets: readonly string[]; priceNote: string;
  previewTitle: string; preview: ReactNode;
  codeTitle: string; code: string;
  faq: readonly (readonly [string, string])[];
};

/** Mise en page commune des pages de présentation des plugins (même structure que la page « Dons »). */
export default function PluginPage(p: PluginPageProps) {
  return <><Header /><PageHero v={p.v ?? 1} eyebrow={p.eyebrow} title={p.title} sub={p.sub} />
    <main className="sec"><div className="wrap stack">
      <div className="g3">{p.features.map(([I, t, d]) => <div className="card feat" key={t}><div className="ic"><I size={22} /></div><h3>{t}</h3><p>{d}</p></div>)}</div>
      <div className="split"><div className="g2" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>{p.steps.map(([t, d], i) => <div className="step" key={t}><i>{i + 1}</i><h3 style={{ fontSize: 17 }}>{t}</h3><p className="mut" style={{ margin: 0 }}>{d}</p></div>)}</div>
        <div className="card price hi"><span className="mut">Inclus dans l’activation</span><div className="big">{p.price} $</div><p className="mut">{p.priceNote}</p>
          <ul className="ck">{p.bullets.map(x => <li key={x}><Check size={18} />{x}</li>)}</ul>
          <p className="mut" style={{ fontSize: 14 }}>Commission par paiement réussi identique aux autres paiements : voir la <Link href="/pricing">tarification</Link>.</p>
          <div style={{ margin: '20px 0' }}><CardLogos label="Cartes acceptées :" /></div><CtaLink className="btn p lg full" guest={['/register', 'Commencer']} user={['/dashboard/woocommerce', 'Télécharger le plugin']} /></div></div>
      <div className="g2">
        <div className="card"><h3 style={{ marginBottom: 6 }}>{p.previewTitle}</h3><p className="mut" style={{ marginTop: 0 }}>Exemple fictif d’affichage.</p>{p.preview}</div>
        <div className="card"><h3 style={{ marginBottom: 6 }}>{p.codeTitle}</h3><p className="mut" style={{ marginTop: 0 }}>Collez un shortcode dans n’importe quelle page ou article.</p><div className="code"><pre>{p.code}</pre></div></div></div>
      <div><h2 style={{ marginBottom: 14 }}>Questions fréquentes</h2><div className="g2">{p.faq.map(([q, a]) => <div className="card" key={q}><h3 style={{ fontSize: 17, marginBottom: 6 }}>{q}</h3><p className="mut" style={{ margin: 0 }}>{a}</p></div>)}</div></div>
    </div></main><Footer /></>;
}

/** Cadre commun des aperçus. */
export function Frame({ children }: { children: ReactNode }) { return <div style={{ border: '1px solid var(--line, #E5EAF2)', borderRadius: 12, padding: 18 }}>{children}</div>; }
