import { describe, expect, it } from 'vitest';
import { bps, fromUnits, toUnits } from '@/lib/money';
describe('money', () => {
  it('convertit sans flottant imprecis', () => { expect(toUnits(0.1) + toUnits(0.2)).toBe(toUnits(0.3)); expect(fromUnits(toUnits(49.9))).toBe('49.900000'); });
  it('calcule les commissions en entiers', () => { expect(bps(toUnits(100), 150)).toBe(toUnits(1.5)); expect(toUnits(100) - 2 * bps(toUnits(100), 150)).toBe(toUnits(97)); });
});
