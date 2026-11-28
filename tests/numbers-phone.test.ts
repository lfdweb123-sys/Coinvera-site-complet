import { describe, expect, it } from 'vitest';
import { dialCode, toForwardingDigits, validForwardingDigits } from '@/lib/numbers/phone';
describe('numéro de renvoi : une longueur par pays, pas 11 chiffres partout', () => {
  it('Bénin : 10 chiffres sans l’indicatif, comme 0162758703', () => { expect(toForwardingDigits('BJ', '0162758703')).toBe('2290162758703'); expect(toForwardingDigits('BJ', '01 62 75 87 03')).toBe('2290162758703'); expect(dialCode('BJ')).toBe('+229'); });
  it('accepte aussi le format international saisi avec le +', () => { expect(toForwardingDigits('FR', '+229 01 62 75 87 03')).toBe('2290162758703'); });
  it('France : 9 chiffres après le 0 national', () => { expect(toForwardingDigits('FR', '06 12 34 56 78')).toBe('33612345678'); });
  it('Royaume-Uni (12 chiffres au total, comme l’exemple de la documentation)', () => { expect(toForwardingDigits('GB', '07350 690992')).toBe('447350690992'); });
  it('États-Unis : 11 chiffres avec l’indicatif', () => { expect(toForwardingDigits('US', '(415) 555-2671')).toBe('14155552671'); });
  it('Sénégal, Côte d’Ivoire, Togo : chacun sa longueur', () => { expect(toForwardingDigits('SN', '77 123 45 67')).toBe('221771234567'); expect(toForwardingDigits('CI', '07 01 23 45 67')).toBe('2250701234567'); expect(toForwardingDigits('TG', '90 12 34 56')).toBe('22890123456'); });
  it('refuse un numéro trop court ou trop long pour le pays, ou vide', () => { expect(toForwardingDigits('BJ', '12345')).toBeNull(); expect(toForwardingDigits('BJ', '0162758703123456')).toBeNull(); expect(toForwardingDigits('BJ', '')).toBeNull(); expect(toForwardingDigits('FR', 'abc')).toBeNull(); });
  it('serveur : chiffres 4 à 15, longueur plausible pour l’indicatif', () => {
    expect(validForwardingDigits('2290162758703')).toBe(true); expect(validForwardingDigits('447350690992')).toBe(true); expect(validForwardingDigits('33612345678')).toBe(true);
    expect(validForwardingDigits('229123')).toBe(false); expect(validForwardingDigits('1234567890123456')).toBe(false); expect(validForwardingDigits('+22901627')).toBe(false); expect(validForwardingDigits('')).toBe(false);
  });
});
