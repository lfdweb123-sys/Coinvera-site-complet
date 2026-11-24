import { seo } from '@/lib/seo';
import { Banknote, Globe2, CreditCard, Wallet } from 'lucide-react';
import { Header, Footer } from '@/components/Site';
import PageHero from '@/components/PageHero';
import SectionTitle from '@/components/Section';
import CountryGrid from '@/components/CountryGrid';
import { COUNTRY_TOTAL } from '@/lib/countries';
export const metadata = seo({ title: 'Couverture mondiale : tous les pays', description: 'Coinvera est pensé pour le monde entier : marchands et clients de tous les pays d’Afrique, d’Amérique, d’Asie, d’Europe et d’Océanie. Liste complète des pays couverts.', path: '/couverture', keywords: ['paiement par carte dans le monde', 'passerelle de paiement internationale', 'pays couverts', 'accepter les paiements dans le monde', 'encaisser depuis l’étranger', 'paiement Afrique Asie Europe Amérique'] });
const F = [
  [Globe2, 'Un compte, depuis n’importe quel pays', 'Ouvrez votre compte marchand où que vous soyez : l’inscription ne dépend pas de votre pays.'],
  [CreditCard, 'Cartes Visa et Mastercard', 'Vos clients paient avec leur carte Visa ou Mastercard, quel que soit le pays de leur banque.'],
  [Wallet, 'Retrait en USDT', 'Le produit de vos ventes est retirable en USDT, sans passer par un compte bancaire local.'],
  [Banknote, 'Une seule offre', 'Une même tarification et une même API pour tous les marchands, partout dans le monde.'],
] as const;
export default function P() {
  return <><Header /><PageHero v={2} eyebrow="Couverture mondiale" title="Coinvera, pour le monde entier" sub={`Marchands et clients de tous les continents : ${COUNTRY_TOTAL} pays, d’Afrique, d’Amérique, d’Asie, d’Europe et d’Océanie.`} />
    <main className="sec"><div className="wrap stack">
      <div className="g4">{F.map(([I, t, d]) => <div className="card feat" key={t}><div className="ic"><I size={22} /></div><h3>{t}</h3><p>{d}</p></div>)}</div>
      <div style={{ marginTop: 'clamp(40px,6vw,72px)' }}><SectionTitle eyebrow="Tous les pays" title="Les pays couverts, " em="continent par continent" sub="Coinvera est conçu pour fonctionner partout : voici tous les pays du monde, continent par continent." />
        <CountryGrid />
        <p className="mut" style={{ marginTop: 28, fontSize: 13.5 }}>Antarctique : aucun État souverain, donc aucun pays à lister.</p></div>
      <div className="card" style={{ marginTop: 'clamp(32px,5vw,56px)' }}><h3 style={{ marginTop: 0 }}>À savoir</h3>
        <p className="mut" style={{ margin: 0 }}>La disponibilité du service reste soumise aux lois applicables, aux programmes de sanctions internationales et aux règles de nos partenaires de paiement et d’émission de cartes. Certaines banques émettrices peuvent aussi refuser une transaction. Pour toute question sur votre pays, écrivez-nous à <a href="mailto:support@coinvera.me">support@coinvera.me</a>.</p></div>
    </div></main><Footer /></>;
}
