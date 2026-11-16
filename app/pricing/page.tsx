import Link from 'next/link';
import { Check } from 'lucide-react';
import { Header, Footer } from '@/components/Site';
import PageHero from '@/components/PageHero';
import { getSettings } from '@/lib/settings';
export const revalidate = 300; export const metadata = { title: 'Tarification' };
export default async function Pricing() {
  const s = await getSettings(); const f = (b: number) => String(b / 100).replace('.', ','); const t = s.processingFeeBps + s.platformFeeBps;
  return <><Header /><PageHero eyebrow="Tarification" title="Des frais clairs, sans surprise" sub="Un seul pourcentage par paiement réussi, détaillé pour chaque transaction." />
    <main className="wrap sec" style={{ paddingTop: 40 }}><div className="grid g3">
      <div className="card price hi"><span className="mut">Commission par paiement</span><div className="big">{f(t)} %</div><p className="mut">{f(s.processingFeeBps)} % de frais de traitement + {f(s.platformFeeBps)} % de frais de plateforme.</p><ul className="ck">{['Aucun abonnement mensuel', 'Détail visible par transaction', 'Rapports exportables en CSV'].map(x => <li key={x}><Check size={18} />{x}</li>)}</ul></div>
      <div className="card price"><span className="mut">Accès à l’API</span><div className="big">{s.apiActivationUsd} $</div><p className="mut">{s.freeTrials} essais gratuits (opérations de test), puis paiement unique.</p></div>
      <div className="card price"><span className="mut">Plugin WooCommerce</span><div className="big">{s.pluginPriceUsd} $</div><p className="mut">Licence liée à votre compte marchand.</p></div></div>
      <div className="card" style={{ marginTop: 24 }}><h3>Exemple — paiement de 100 USDT</h3><div className="twrap"><table className="tbl"><tbody>
        <tr><td data-label="Frais de traitement">Frais de traitement ({f(s.processingFeeBps)} %)</td><td className="r num" data-label="">{(100 * s.processingFeeBps / 10000).toFixed(2)} USDT</td></tr>
        <tr><td data-label="Frais de plateforme">Frais de plateforme ({f(s.platformFeeBps)} %)</td><td className="r num" data-label="">{(100 * s.platformFeeBps / 10000).toFixed(2)} USDT</td></tr>
        <tr><td data-label="Commission totale"><b>Commission totale</b></td><td className="r num" data-label="">{(100 * t / 10000).toFixed(2)} USDT</td></tr>
        <tr><td data-label="Net"><b>Montant net attribué</b></td><td className="r num" data-label=""><b>{(100 - 100 * t / 10000).toFixed(2)} USDT</b></td></tr></tbody></table></div></div>
      <p className="mut" style={{ marginTop: 18 }}>Des frais de réseau peuvent s’appliquer aux retraits ; ils sont indiqués avant confirmation. Retrait minimum : {s.minWithdrawalUsd} USD.</p><Link className="btn p lg" href="/register">Commencer gratuitement</Link></main><Footer /></>;
}
