'use client';
import { usePathname } from 'next/navigation';
import CoinveraAI from '@/components/CoinveraAI';
// Bouton flottant « Coinvera AI » des pages publiques : visible sur l'accueil et la page contact seulement.
// Le chat reste fermé tant que le visiteur n'a pas cliqué sur le bouton.
const PAGES = new Set(['/', '/contact']);
export default function PublicChat() {
  const path = usePathname();
  if (!PAGES.has(path)) return null;
  return <div className="ai-fab"><CoinveraAI visitor /></div>;
}
