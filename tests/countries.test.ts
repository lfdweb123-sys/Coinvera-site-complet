import { describe, expect, it } from 'vitest';
import { CONTINENTS, COUNTRY_TOTAL } from '@/lib/countries';
describe('liste des pays de la page Couverture', () => {
  it('compte les 193 États membres de l’ONU + 2 États observateurs', () => { expect(COUNTRY_TOTAL).toBe(195); });
  it('compte les pays attendus par continent', () => {
    const n = Object.fromEntries(CONTINENTS.map(c => [c.id, c.countries.length]));
    expect(n).toEqual({ afrique: 54, 'amerique-nord': 3, 'amerique-centrale': 20, 'amerique-sud': 12, europe: 45, asie: 47, oceanie: 14 });
  });
  it('ne contient aucun doublon, ni pays vide', () => {
    const all = CONTINENTS.flatMap(c => c.countries); expect(new Set(all).size).toBe(all.length); expect(all.every(x => x.trim().length > 1)).toBe(true);
  });
});
