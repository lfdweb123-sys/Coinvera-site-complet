import { getCountries, getCountryCallingCode, isPossiblePhoneNumber, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/min';
// Numéro de renvoi d'appel (paramètre « number » de l'achat 5sim : numéro SANS le +, avec l'indicatif du pays).
// La documentation 5sim écrit « 11 digits » mais se contredit : son exemple (447350690992) a 12 chiffres et le rachat d'un numéro accepte « 4-15 digits ».
// Chaque pays a sa propre longueur (Bénin : 10 chiffres après +229, ex. 0162758703) : on valide donc par pays avec libphonenumber, puis on envoie l'international sans le +.
/** Chiffres internationaux (sans +) d'un numéro saisi dans le format du pays choisi ; null si la longueur ou le format ne conviennent pas à ce pays. */
export function toForwardingDigits(iso: string, input: string): string | null {
  const raw = input.trim(); if (!raw) return null;
  const p = parsePhoneNumberFromString(raw, raw.startsWith('+') ? undefined : (iso.toUpperCase() as CountryCode));
  if (!p || !p.isPossible()) return null;
  const d = p.number.replace(/\D/g, ''); return /^\d{4,15}$/.test(d) ? d : null;
}
/** Validation côté serveur : chiffres seuls (4 à 15, limite E.164 reprise par la documentation) et longueur plausible pour l'indicatif du pays. */
export const validForwardingDigits = (d: string) => /^\d{4,15}$/.test(d) && isPossiblePhoneNumber('+' + d);
export const dialCode = (iso: string) => { try { return '+' + getCountryCallingCode(iso.toUpperCase() as CountryCode); } catch { return ''; } };
export const phoneCountries = () => getCountries() as string[];
