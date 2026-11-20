import Link from 'next/link';
import { Check, CreditCard, FileDown, Heart, ShieldCheck, Target, Users } from 'lucide-react';
import { Header, Footer } from '@/components/Site';
import PageHero from '@/components/PageHero';
import CtaLink from '@/components/Cta';
import { CardLogos } from '@/components/Logos';
import { getSettings } from '@/lib/settings';
export const revalidate = 300;
export const metadata = { title: 'Plugin de dons WordPress', description: 'Collectez des dons et gérez des cagnottes sur WordPress avec Coinvera : paiement par carte sécurisé, objectif et progression, confirmation vérifiée côté serveur. Même licence que le plugin WooCommerce.', alternates: { canonical: '/dons' } };
const F = [
  [Target, 'Cagnottes avec objectif', 'Objectif, date limite, don minimum et montants suggérés. Barre de progression et compte à rebours intégrés.'],
  [CreditCard, 'Paiement par carte sécurisé', 'Page de paiement hébergée par Coinvera : aucune donnée de carte ne transite par votre site.'],
  [ShieldCheck, 'Dons vérifiés côté serveur', 'Un don n’est compté qu’après relecture du paiement auprès de l’API : jamais sur un simple retour du navigateur.'],
  [Users, 'Donateurs et dons anonymes', 'Mur des derniers donateurs, message personnalisé, option « don anonyme » pour chaque donateur.'],
  [FileDown, 'Suivi et export', 'Liste des dons filtrable, export CSV, e-mail de notification et de remerciement automatiques.'],
  [Heart, 'Sans WooCommerce', 'Un plugin WordPress autonome : formulaire de don libre ou cagnotte, à placer partout avec un shortcode.'],
] as const;
const STEPS = [['Créez votre compte et activez-le', 'Un seul paiement unique : la licence du plugin est incluse.'], ['Installez le fichier ZIP dans WordPress', 'Extensions → Ajouter → Téléverser, puis activez.'], ['Saisissez votre licence et vos clés API', 'Dons Coinvera → Réglages. Les clés secrètes sont stockées chiffrées.'], ['Créez une cagnotte et collez son shortcode', 'Les dons sont confirmés automatiquement et apparaissent dans la liste.']];
const FAQ = [
  ['Faut-il WooCommerce ?', 'Non. Le plugin de dons est autonome et fonctionne sur n’importe quel site WordPress (5.8 et plus, PHP 7.4 et plus).'],
  ['Faut-il une deuxième licence ?', 'Non. C’est la même licence que le plugin WooCommerce, incluse dans l’activation de votre compte. Elle s’active par site : les deux plugins peuvent cohabiter sur le même site.'],
  ['Dans quelle devise sont les dons ?', 'En dollars américains (USD), de 1 $ à 50 000 $ par don.'],
  ['Les dons de test sont-ils comptés ?', 'Non. Pendant vos essais gratuits, les paiements de test sont signalés comme tels et ne sont jamais ajoutés au total de la cagnotte.'],
  ['Que se passe-t-il pour les données personnelles ?', 'Le nom, l’e-mail et le message sont facultatifs. Le plugin s’intègre aux outils d’export et d’effacement de WordPress (RGPD).'],
];
const CODE = `[coinvera_campaign id="12"]            cagnotte complète
[coinvera_donate]                      don libre
[coinvera_donate id="12"]              formulaire d'une cagnotte
[coinvera_progress id="12"]            barre de progression
[coinvera_donors id="12" limit="10"]   derniers donateurs`;
export default async function P() { const s = await getSettings();
  return <><Header /><PageHero v={1} eyebrow="Plugin de dons" title="Collectez des dons et gérez vos cagnottes sur WordPress" sub="Un plugin autonome : cagnottes avec objectif, paiement par carte sécurisé et dons comptés uniquement après confirmation côté serveur." />
    <main className="sec"><div className="wrap stack">
      <div className="g3">{F.map(([I, t, d]) => <div className="card feat" key={t}><div className="ic"><I size={22} /></div><h3>{t}</h3><p>{d}</p></div>)}</div>
      <div className="split"><div className="g2" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>{STEPS.map(([t, d], i) => <div className="step" key={t}><i>{i + 1}</i><h3 style={{ fontSize: 17 }}>{t}</h3><p className="mut" style={{ margin: 0 }}>{d}</p></div>)}</div>
        <div className="card price hi"><span className="mut">Inclus dans l’activation</span><div className="big">{s.apiActivationUsd} $</div><p className="mut">Un seul paiement unique : API de production, plugin WooCommerce et plugin de dons, avec la même licence.</p>
          <ul className="ck">{['Même licence unique que le plugin WooCommerce', 'Cagnottes et dons illimités', 'Mises à jour du plugin', 'Dons en USD, par carte Visa et Mastercard'].map(x => <li key={x}><Check size={18} />{x}</li>)}</ul>
          <p className="mut" style={{ fontSize: 14 }}>Commission par paiement réussi identique aux autres paiements : voir la <Link href="/pricing">tarification</Link>.</p>
          <div style={{ margin: '20px 0' }}><CardLogos label="Cartes acceptées :" /></div><CtaLink className="btn p lg full" guest={['/register', 'Commencer']} user={['/dashboard/woocommerce', 'Télécharger le plugin']} /></div></div>
      <div className="g2">
        <div className="card"><h3 style={{ marginBottom: 6 }}>Aperçu d’une cagnotte</h3><p className="mut" style={{ marginTop: 0 }}>Exemple fictif d’affichage sur votre site.</p>
          <div style={{ border: '1px solid var(--line, #E5EAF2)', borderRadius: 12, padding: 18 }}><b style={{ fontSize: 17 }}>Nouvelle bibliothèque</b>
            <div role="img" aria-label="Progression : 62 %" style={{ height: 10, background: '#E5EAF2', borderRadius: 999, margin: '14px 0 8px', overflow: 'hidden' }}><div style={{ width: '62%', height: '100%', background: 'var(--brand, #1D4ED8)' }} /></div>
            <p style={{ margin: '0 0 12px' }}><b>1 250 $</b> collectés sur 2 000 $ <span className="mut">(62 %) · 41 dons · 12 jours restants</span></p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>{['10 $', '25 $', '50 $', 'Autre'].map((a, i) => <span key={a} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #E5EAF2', fontWeight: 600, background: i === 1 ? 'var(--brand, #1D4ED8)' : '#fff', color: i === 1 ? '#fff' : 'inherit' }}>{a}</span>)}</div>
            <span className="btn p full" aria-hidden="true">Faire un don</span></div></div>
        <div className="card"><h3 style={{ marginBottom: 6 }}>Quelques lignes pour tout afficher</h3><p className="mut" style={{ marginTop: 0 }}>Collez un shortcode dans n’importe quelle page ou article.</p><div className="code"><pre>{CODE}</pre></div></div></div>
      <div><h2 style={{ marginBottom: 14 }}>Questions fréquentes</h2><div className="g2">{FAQ.map(([q, a]) => <div className="card" key={q}><h3 style={{ fontSize: 17, marginBottom: 6 }}>{q}</h3><p className="mut" style={{ margin: 0 }}>{a}</p></div>)}</div></div>
    </div></main><Footer /></>; }
