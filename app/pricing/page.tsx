import { Check } from 'lucide-react';
import { Header, Footer } from '@/components/Site';
import PageHero from '@/components/PageHero';
import CtaLink from '@/components/Cta';
import { CardLogos } from '@/components/Logos';
import { getSettings } from '@/lib/settings';
export const revalidate = 300;
export const metadata = { title: 'Tarification', description: 'Une commission unique par paiement réussi, un accès API et un plugin WooCommerce à tarif fixe. Aucun abonnement.', alternates: { canonical: '/pricing' } };
export default async function Pricing() {
  const s = await getSettings(); const f = (b: number) => String(b / 100).replace('.', ','); const t = s.processingFeeBps + s.platformFeeBps;
  return <><Header /><PageHero v={1} eyebrow="Tarification" title="Des frais clairs, sans surprise" sub="Un seul pourcentage par paiement réussi, détaillé pour chaque transaction." />
    <main className="sec"><div className="wrap stack"><div className="g3">
      <div className="card price hi"><span className="mut">Commission par paiement</span><div className="big">{f(t)} %</div><p className="mut">{f(s.processingFeeBps)} % de frais de traitement + {f(s.platformFeeBps)} % de frais de plateforme.</p><ul className="ck">{['Aucun abonnement mensuel', 'Détail visible par transaction', 'Rapports exportables en CSV'].map(x => <li key={x}><Check size={18} />{x}</li>)}</ul></div>
      <div className="card price"><span className="mut">Activation du compte</span><div className="big">{s.apiActivationUsd} $</div><p className="mut">Paiement unique, après {s.freeTrials} essais gratuits (opérations de test).</p><ul className="ck">{['Clés API de production', 'Plugin WooCommerce inclus', 'Liens de paiement et webhooks'].map(x => <li key={x}><Check size={18} />{x}</li>)}</ul></div>
      <div className="card price"><span className="mut">Retraits</span><div className="big">{s.minWithdrawalUsd} $ min.</div><p className="mut">Manuel ou automatique, en USDT.</p><ul className="ck">{['Frais de réseau affichés avant confirmation', 'Seuil de retrait automatique au choix', 'Adresse contrôlée avant envoi'].map(x => <li key={x}><Check size={18} />{x}</li>)}</ul></div></div>
      <div className="g2"><div className="card"><h3 style={{ marginBottom: 12 }}>Exemple — paiement de 100 USDT</h3><div className="twrap"><table className="tbl"><tbody>
        <tr><td data-label="Frais de traitement">Frais de traitement ({f(s.processingFeeBps)} %)</td><td className="r num" data-label="">{(100 * s.processingFeeBps / 10000).toFixed(2)} USDT</td></tr>
        <tr><td data-label="Frais de plateforme">Frais de plateforme ({f(s.platformFeeBps)} %)</td><td className="r num" data-label="">{(100 * s.platformFeeBps / 10000).toFixed(2)} USDT</td></tr>
        <tr><td data-label="Commission totale"><b>Commission totale</b></td><td className="r num" data-label="">{(100 * t / 10000).toFixed(2)} USDT</td></tr>
        <tr><td data-label="Net"><b>Montant net attribué</b></td><td className="r num" data-label=""><b>{(100 - 100 * t / 10000).toFixed(2)} USDT</b></td></tr></tbody></table></div></div>
        <div className="card"><h3 style={{ marginBottom: 12 }}>Retraits</h3><ul className="ck" style={{ marginTop: 0 }}>{[`Retrait minimum : ${s.minWithdrawalUsd} USD`, `Frais de réseau : ${s.withdrawalFeeTRX} $ (TRC20), ${s.withdrawalFeeBSC} $ (BEP20), ${s.withdrawalFeeETH} $ (ERC20)`, 'Retraits automatiques dès un seuil de votre choix', 'Montant exact affiché avant confirmation'].map(x => <li key={x}><Check size={18} />{x}</li>)}</ul><div style={{ marginTop: 18 }}><CardLogos label="Paiements acceptés :" /></div></div></div>
      <div style={{ textAlign: 'center' }}><CtaLink className="btn p lg" guest={['/register', 'Commencer gratuitement']} user={['/dashboard', 'Accéder au tableau de bord']} /></div></div></main><Footer /></>;
}
