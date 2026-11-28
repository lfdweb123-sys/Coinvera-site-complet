import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
vi.mock('@/lib/auth', () => ({ HttpError: class extends Error { constructor(public status: number, public code: string) { super(code); } } }));
vi.mock('@/lib/firebase-admin', () => ({ db: {} }));
import { apply, BLOCK_MS, MAX, normalize, POINTS, view } from '@/lib/numbers/rating';
const S = (rating = MAX, blockedUntil = 0) => ({ rating, blockedUntil }); const T = 1_000_000;
describe('note de la documentation 5sim', () => {
  it('démarre à 96 points, maximum 96', () => { expect(normalize(undefined, T)).toEqual(S(9600)); expect(view(S(9600))).toEqual({ rating: 96, max: 96, blockedUntil: null }); expect(apply(S(9600), 'replenish', T).rating).toBe(9600); });
  it('applique exactement les barèmes de la documentation', () => {
    expect(POINTS).toEqual({ replenish: 800, completedEarly: 50, completedLate: 40, timeout: -15, canceled: -10, banned: -10 });
    const s = S(5000); expect(apply(s, 'replenish', T).rating).toBe(5800); expect(apply(s, 'completedEarly', T).rating).toBe(5050); expect(apply(s, 'completedLate', T).rating).toBe(5040);
    expect(apply(s, 'timeout', T).rating).toBe(4985); expect(apply(s, 'canceled', T).rating).toBe(4990); expect(apply(s, 'banned', T).rating).toBe(4990);
  });
  it('plafonne à 96 après une recharge', () => { expect(apply(S(9300), 'replenish', T).rating).toBe(9600); });
  it('à zéro : achats bloqués 24 h', () => { const z = apply(S(10), 'canceled', T); expect(z).toEqual({ rating: 0, blockedUntil: T + BLOCK_MS }); expect(apply(S(5), 'timeout', T).blockedUntil).toBe(T + BLOCK_MS); });
  it('pendant le blocage la note ne bouge plus ; après 24 h elle revient à 96', () => {
    const z = S(0, T + BLOCK_MS); expect(apply(z, 'replenish', T + 1000)).toEqual(z);
    expect(normalize(z, T + BLOCK_MS - 1)).toEqual(z); expect(normalize(z, T + BLOCK_MS)).toEqual(S(9600, 0)); expect(normalize(z, T + 2 * BLOCK_MS)).toEqual(S(9600, 0));
  });
  it('ne produit aucune erreur d’arrondi sur de nombreux événements', () => { let s = S(9600); for (let i = 0; i < 20; i++) s = apply(s, 'canceled', T); expect(s.rating).toBe(9400); });
  it('ignore une valeur corrompue en base', () => { expect(normalize({ rating: 'x' }, T)).toEqual(S(9600)); expect(normalize({ rating: 99999 }, T).rating).toBe(9600); expect(normalize({ rating: -5 }, T).rating).toBe(0); });
});
