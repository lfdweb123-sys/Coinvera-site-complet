import { Nfc, Snowflake } from 'lucide-react';
import { KIND_LABEL, kindOf } from './CardArt';
// Visuel d'une Virtuals card pro : marque Coinvera en haut, titulaire, numéro, EXP / CVV et logo Visa en bas. Une couleur par type de carte (virtuelle, sans contact, Platinum).
// Numéro, expiration et code ne s'affichent que si on les fournit (affichage demandé par le titulaire, jamais stocké).
export default function ProCard({ product, name, last4, expiry, pan, cvv, frozen }: { product?: string | null; name?: string | null; last4?: string | null; expiry?: string | null; pan?: string | null; cvv?: string | null; frozen?: boolean }) {
  const k = kindOf(product ?? ''), digits = (pan ?? '').replace(/\D/g, ''), num = digits ? (digits.match(/.{1,4}/g) ?? []).join(' ') : `•••• •••• •••• ${last4 || '••••'}`;
  return <div className="pcv-w"><div className={'pcv pcv-' + k} role="img" aria-label={`Carte Coinvera ${KIND_LABEL[k]}${last4 ? ` se terminant par ${last4}` : ''}${frozen ? ', gelée' : ''}`}>
    <div className="pcv-top"><span className="pcv-brand">Coinvera</span>{k !== 'virtual' && <span className="pcv-tag"><Nfc size={16} aria-hidden /> {KIND_LABEL[k].toUpperCase()}</span>}</div>
    <div className="pcv-bot"><div className="pcv-info"><span className="pcv-name">{name || 'TITULAIRE'}</span><span className="pcv-num">{num}</span>
      <span className="pcv-meta"><span>EXP {expiry || '••/••'}</span><span>CVV {cvv || '•••'}</span></span></div><span className="pcv-visa" aria-hidden>VISA</span></div>
    {frozen && <div className="pcv-frz"><Snowflake size={18} aria-hidden /> Carte gelée</div>}
  </div></div>;
}
