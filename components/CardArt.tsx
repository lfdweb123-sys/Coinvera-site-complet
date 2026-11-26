import { Nfc } from 'lucide-react';
// Visuel d'une carte selon son type. Type reconnu au nom du produit : Platinum, Contactless (sans contact) ou Virtual (virtuelle).
export type CardKind = 'virtual' | 'contactless' | 'platinum';
export const kindOf = (name: string): CardKind => (/platinum/i.test(name) ? 'platinum' : /contactless|sans[ -]?contact/i.test(name) ? 'contactless' : 'virtual');
export const KIND_LABEL: Record<CardKind, string> = { virtual: 'Virtuelle', contactless: 'Sans contact', platinum: 'Platinum' };
export default function CardArt({ name, last4 }: { name: string; last4?: string | null }) {
  const k = kindOf(name);
  return <div className={'cart cart-' + k} role="img" aria-label={`Carte ${KIND_LABEL[k]}`}>
    <div className="cart-top"><span className="cart-chip" />{k !== 'virtual' ? <Nfc size={20} /> : <span className="cart-tag">VIRTUAL</span>}</div>
    <div className="cart-num">•••• •••• •••• {last4 || '0000'}</div>
    <div className="cart-bot"><span className="cart-name">{k === 'platinum' ? 'PLATINUM' : k === 'contactless' ? 'CONTACTLESS' : 'COINVERA'}</span><span className="cart-visa">VISA</span></div></div>;
}
