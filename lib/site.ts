export const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.coinvera.me';
export const DOCS = 'https://docs.coinvera.me', STATUS = 'https://status.coinvera.me', API = 'https://api.coinvera.me';
export const HELP = 'https://helpcenter.coinvera.me';
// Réseaux sociaux affichés en bas de page (à droite). Collez simplement l'adresse complète (https://…) entre les guillemets ; aucun réglage d'environnement.
// Tant qu'une adresse est vide (''), l'icône s'affiche quand même et renvoie vers la page Contact.
export const SOCIALS = [
  { id: 'x', label: 'X', url: '' },
  { id: 'telegram', label: 'Telegram', url: '' },
  { id: 'whatsapp', label: 'WhatsApp', url: '' },
  { id: 'facebook', label: 'Facebook', url: '' },
  { id: 'instagram', label: 'Instagram', url: '' },
  { id: 'linkedin', label: 'LinkedIn', url: '' },
  { id: 'youtube', label: 'YouTube', url: '' },
  { id: 'github', label: 'GitHub', url: '' },
];
