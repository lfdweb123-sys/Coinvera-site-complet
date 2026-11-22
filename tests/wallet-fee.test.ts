import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/cards/cryptoinfra', () => ({ ci: vi.fn(), CORE: () => 'x' }));
import { grossUp, netOf } from '@/lib/cards/wallet';
describe('frais de dépôt', () => {
  it('le net après frais couvre toujours le montant demandé', () => {
    for (const u of [1_000_000, 12_340_000, 99_990_000]) for (const bps of [0, 100, 250]) expect(netOf(grossUp(u, bps), bps)).toBeGreaterThanOrEqual(u);
  });
  it('sans frais, rien ne change', () => { expect(grossUp(5_000_000, 0)).toBe(5_000_000); });
});
