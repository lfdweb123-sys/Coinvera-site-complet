// Aides d'affichage du module eSIM (sûr côté client : aucune dépendance serveur).
// Normalisation de recherche : sans accents ni majuscules, espaces compactés.
export const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const GIB = 1024 ** 3, MIB = 1024 ** 2;
// Volume de données (le prestataire compte en octets, par puissances de 1024).
export const gbLabel = (bytes: number) => { const g = bytes / GIB; if (g < 1) return `${Math.round(bytes / MIB)} Mo`; return `${(Math.round(g * 10) / 10).toString().replace('.', ',')} Go`; };
// Volume d'un forfait : « 5 Go » (total) ou « 1 Go/jour » (forfait par jour) ; « Illimité » si le prestataire n'indique aucun volume.
export const planGb = (bytes: number, daily: boolean) => bytes > 0 ? gbLabel(bytes) + (daily ? '/jour' : '') : 'Illimité';
export const daysLabel = (n: number) => `${n} jour${n > 1 ? 's' : ''}`;
// Drapeau (image) d'un pays à partir de son code ISO à deux lettres ; null pour les codes composés ou régionaux.
export const flagUrl = (code?: string | null) => code && /^[A-Za-z]{2}$/.test(code) ? `https://flagcdn.com/w80/${code.toLowerCase()}.png` : null;
export const REGIONS: [string, string][] = [['afrique', 'Afrique'], ['europe', 'Europe'], ['asie', 'Asie'], ['moyen-orient', 'Moyen-Orient'], ['ameriques', 'Amériques'], ['oceanie', 'Océanie']];
// États d'une eSIM affichés à l'utilisateur.
export const STATES: Record<string, { label: string; cls: 'ok' | 'info' | 'warn' | 'bad' | '' }> = {
  preparing: { label: 'En préparation', cls: 'info' }, ready: { label: 'Prête à installer', cls: 'info' }, installed: { label: 'Installée', cls: 'ok' }, active: { label: 'Active', cls: 'ok' },
  depleted: { label: 'Données épuisées', cls: 'warn' }, expired: { label: 'Expirée', cls: '' }, refunded: { label: 'Remboursée', cls: '' }, revoked: { label: 'Révoquée', cls: 'bad' },
  suspended: { label: 'Suspendue', cls: 'warn' }, failed: { label: 'Échouée', cls: 'bad' }, review: { label: 'Vérification', cls: 'warn' },
};
