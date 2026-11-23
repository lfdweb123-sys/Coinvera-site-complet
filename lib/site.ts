export const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.coinvera.me';
export const DOCS = 'https://docs.coinvera.me', STATUS = 'https://status.coinvera.me', API = 'https://api.coinvera.me';
export const HELP = 'https://helpcenter.coinvera.me';
// Réseaux sociaux affichés en bas de page (à droite).
// Aucune adresse n'est écrite en dur : renseignez-les dans les variables NEXT_PUBLIC_SOCIAL_X, _TELEGRAM, _WHATSAPP, _FACEBOOK, _INSTAGRAM, _LINKEDIN, _YOUTUBE et _GITHUB
// (adresses complètes https://…), puis redéployez. Seuls les réseaux renseignés s'affichent ; sans aucune adresse, le texte www.coinvera.me reste affiché.
export const SOCIALS = [
  { id: 'x', label: 'X', url: process.env.NEXT_PUBLIC_SOCIAL_X },
  { id: 'telegram', label: 'Telegram', url: process.env.NEXT_PUBLIC_SOCIAL_TELEGRAM },
  { id: 'whatsapp', label: 'WhatsApp', url: process.env.NEXT_PUBLIC_SOCIAL_WHATSAPP },
  { id: 'facebook', label: 'Facebook', url: process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK },
  { id: 'instagram', label: 'Instagram', url: process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM },
  { id: 'linkedin', label: 'LinkedIn', url: process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN },
  { id: 'youtube', label: 'YouTube', url: process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE },
  { id: 'github', label: 'GitHub', url: process.env.NEXT_PUBLIC_SOCIAL_GITHUB },
].filter((s): s is { id: string; label: string; url: string } => /^https?:\/\//i.test(s.url ?? ''));
