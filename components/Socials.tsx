import { Facebook, Github, Instagram, Linkedin, MessageCircle, Send, Youtube } from 'lucide-react';
import { SOCIALS } from '@/lib/site';
const X = ({ size = 18 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>;
const ICON: Record<string, any> = { x: X, telegram: Send, whatsapp: MessageCircle, facebook: Facebook, instagram: Instagram, linkedin: Linkedin, youtube: Youtube, github: Github };
// Icônes des réseaux sociaux (pied de page). Sans aucune adresse configurée, l'ancien texte du site est conservé.
export default function Socials() {
  if (!SOCIALS.length) return <span>www.coinvera.me</span>;
  return <span className="socials" style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>{SOCIALS.map(s => { const I = ICON[s.id]; return <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer" aria-label={s.label} title={s.label} className="soc"><I size={18} /></a>; })}</span>;
}
