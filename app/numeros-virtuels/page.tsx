import { seo } from '@/lib/seo';
import { Check, Clock, Globe, MessageCircle, ShieldCheck, Undo2, Wallet, Zap } from 'lucide-react';
import { Header, Footer } from '@/components/Site';
import PageHero from '@/components/PageHero';
import CtaLink from '@/components/Cta';
import { catalog } from '@/lib/numbers/catalog';
export const revalidate = 300;
export const metadata = seo({ title: 'Numéros WhatsApp et Telegram : vérification par SMS dans tous les pays', description: 'Recevez le code de vérification de WhatsApp ou Telegram sur un numéro temporaire, dans le pays de votre choix. Payé avec votre solde Coinvera, remboursé immédiatement si le code n’arrive pas.', path: '/numeros-virtuels', keywords: ['numéro virtuel WhatsApp', 'numéro virtuel Telegram', 'vérification WhatsApp', 'vérification Telegram', 'recevoir code SMS', 'numéro temporaire', 'numéro virtuel pays', 'code de vérification SMS'] });
const F = [
  [MessageCircle, 'Une vérification, pas un numéro à garder', 'Le numéro est temporaire : il sert à recevoir le code de vérification de WhatsApp ou de Telegram, puis il est libéré.'],
  [Globe, 'Tous les pays disponibles', 'Tous les pays où des numéros sont libres au moment de votre achat, avec le nombre de numéros et le taux de réception des codes.'],
  [Wallet, 'Payé avec votre solde', 'Le montant est débité de votre solde Coinvera, uniquement si vous avez les fonds. Sinon, rechargez votre solde puis revenez.'],
  [Undo2, 'Remboursement immédiat', 'Annulation, code non reçu dans le délai ou numéro refusé : le montant revient aussitôt sur votre solde, une seule fois.'],
  [Zap, 'Code en direct', 'Le numéro et le code s’affichent dans votre tableau de bord, actualisés automatiquement dès que le SMS arrive.'],
  [ShieldCheck, 'Achat sécurisé', 'Votre solde est réservé avant l’achat puis réglé ou rendu : un double clic ne crée jamais deux commandes.'],
] as const;
const STEPS = [['Créez votre compte', 'Inscription gratuite, adresse e-mail vérifiée.'], ['Alimentez votre solde', 'Rechargez votre solde Coinvera si nécessaire : le prix est débité seulement à l’achat.'], ['Choisissez le service et le pays', 'WhatsApp ou Telegram, le pays, et si vous le souhaitez l’opérateur. Le prix est affiché avant l’achat.'], ['Recevez votre code', 'Copiez le numéro, demandez le code dans l’application, il apparaît ici. Pas de code ? Annulez : vous êtes remboursé.']] as const;
const FAQ = [
  ['Est-ce un numéro que je peux garder ?', 'Non. C’est une vérification : le numéro est temporaire (quelques minutes), il reçoit le code de vérification demandé, puis il est libéré. N’utilisez pas ce numéro pour récupérer un compte plus tard.'],
  ['Combien ça coûte ?', 'Un prix fixe par vérification, affiché en XOF avant l’achat et débité de votre solde Coinvera. Il est converti en dollars au taux du jour au moment de l’achat.'],
  ['Et si mon solde est insuffisant ?', 'L’achat est refusé sans aucun débit : rechargez votre solde depuis votre tableau de bord, puis recommencez.'],
  ['Le code n’arrive pas, que se passe-t-il ?', 'Vous pouvez annuler à tout moment avant l’arrivée du code : le montant est remis sur votre solde aussitôt. Si vous ne faites rien, la commande expire et le remboursement est automatique.'],
  ['Le numéro est déjà utilisé sur WhatsApp ou Telegram.', 'Utilisez « Numéro déjà utilisé » : le numéro est signalé, vous êtes remboursé et vous pouvez en prendre un autre.'],
  ['Puis-je racheter le même numéro ?', 'Oui, si vous avez coché l’option de réutilisation à l’achat : un bouton « Racheter ce numéro » apparaît une fois le code reçu, au même prix.'],
  ['Une vérification d’identité est-elle demandée ?', 'Non. Aucune vérification d’identité (KYC) n’est demandée pour créer un compte Coinvera et acheter un numéro. Seule exception : les cartes virtuelles, dont l’émetteur partenaire exige l’identité du titulaire.'],
  ['Puis-je utiliser ces numéros comme je veux ?', 'Les numéros doivent être utilisés dans le respect des conditions d’utilisation de WhatsApp, de Telegram et des lois de votre pays. Vous restez responsable de l’usage que vous en faites.'],
] as const;
export default async function P() {
  let c: Awaited<ReturnType<typeof catalog>> | null = null; try { c = await catalog(); } catch {}
  const price = c?.price; const fmt = (n: number) => n.toLocaleString('fr-FR');
  return <><Header /><PageHero v={2} eyebrow="WhatsApp et Telegram" title="Numéros pour vos codes de vérification" sub="Recevez le code de vérification de WhatsApp ou de Telegram sur un numéro temporaire, dans le pays de votre choix. Remboursé aussitôt si le code n’arrive pas." />
    <main className="sec"><div className="wrap stack">
      <div className="g3">{F.map(([I, t, d]) => <div className="card feat" key={t}><div className="ic"><I size={22} /></div><h3>{t}</h3><p>{d}</p></div>)}</div>
      <div className="card" style={{ display: 'flex', gap: 24, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginTop: 'clamp(28px,4vw,48px)' }}>
        <div><div className="mut" style={{ marginBottom: 4 }}>Prix par vérification</div><div style={{ fontSize: 'clamp(30px,5vw,44px)', fontWeight: 700, letterSpacing: '-.03em' }}>{fmt(price?.xof ?? 8500)} XOF</div>{price?.usd ? <div className="mut">soit environ {price.usd.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $ au taux du jour</div> : null}</div>
        <div style={{ display: 'grid', gap: 8 }}><div><Check size={16} style={{ verticalAlign: -3 }} /> Débité de votre solde, uniquement si vous avez les fonds</div><div><Check size={16} style={{ verticalAlign: -3 }} /> Remboursement immédiat : annulation, code non reçu, numéro refusé</div><div><Clock size={16} style={{ verticalAlign: -3 }} /> Numéro valable environ 15 minutes</div></div>
        <CtaLink className="btn p lg" guest={['/register', 'Créer mon compte']} user={['/dashboard/numeros', 'Obtenir un numéro']} /></div>
      <section style={{ marginTop: 'clamp(32px,5vw,56px)' }}><h2>Comment ça marche</h2><ol className="steps" style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 14 }}>{STEPS.map(([t, d], i) => <li key={t} className="card" style={{ display: 'flex', gap: 14 }}><b style={{ fontSize: 22 }}>{i + 1}</b><div><b>{t}</b><p className="mut" style={{ margin: '4px 0 0' }}>{d}</p></div></li>)}</ol></section>
      <section style={{ marginTop: 'clamp(32px,5vw,56px)' }}><h2>Pays disponibles en ce moment</h2>
        {c ? (c.services as { key: string; label: string }[]).map(sv => <div key={sv.key} style={{ marginBottom: 28 }}><h3>{sv.label} <span className="mut">· {c!.countries[sv.key].length} pays</span></h3>
          <ul className="cv-grid">{c!.countries[sv.key].map(x => <li key={x.slug}>{x.name} <span className="mut">· {fmt(x.count)}</span></li>)}</ul></div>)
          : <p className="mut">La liste des pays disponibles s’affiche dans votre espace, au moment de l’achat.</p>}
        <p className="mut" style={{ fontSize: 13.5 }}>La disponibilité change en permanence : un pays apparaît dès qu’un numéro est libre et disparaît quand il n’y en a plus.</p></section>
      <section style={{ marginTop: 'clamp(32px,5vw,56px)' }}><h2>Questions fréquentes</h2><div style={{ display: 'grid', gap: 10 }}>{FAQ.map(([q, a]) => <details key={q} className="card"><summary style={{ cursor: 'pointer', fontWeight: 600 }}>{q}</summary><p className="mut" style={{ margin: '10px 0 0' }}>{a}</p></details>)}</div></section>
    </div></main><Footer /></>;
}
