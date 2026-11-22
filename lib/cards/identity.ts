import { z } from 'zod';
// Identité exigée par l'émetteur pour ouvrir un compte carte (sinon CryptoInfra répond « incomplete_identity »).
// Ces données sont transmises au prestataire et NE SONT PAS conservées chez nous (seuls prénom et nom le sont, pour reprendre une inscription interrompue).
const Name = z.string().trim().min(1).max(64).regex(/^[\p{L}][\p{L} .'-]*$/u);
const Free = (max: number) => z.string().trim().min(2).max(max);
export const adult = (dob: string, now = new Date()) => {
  const d = new Date(dob + 'T00:00:00Z'); if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dob) return false;
  let age = now.getUTCFullYear() - d.getUTCFullYear(); const m = now.getUTCMonth() - d.getUTCMonth(); if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
  return age >= 18 && age <= 110;
};
export const Identity = z.object({
  firstName: Name, lastName: Name, dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), phone: z.string().trim().regex(/^\+[1-9]\d{6,14}$/),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/), address: Free(128), city: Free(64), zipCode: Free(16), state: z.string().trim().max(64).optional() });
export type IdentityInput = z.infer<typeof Identity>;
export const toProvider = (i: IdentityInput) => ({ first_name: i.firstName, last_name: i.lastName, phone: i.phone, date_of_birth: i.dateOfBirth, country: i.country, address: i.address, city: i.city, zip_code: i.zipCode, ...(i.state ? { state: i.state } : {}) });
