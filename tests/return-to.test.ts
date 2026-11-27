import { describe, expect, it } from 'vitest';
import { safeNext } from '@/lib/return-to';
describe('chemin de retour après connexion', () => {
  it('accepte uniquement les chemins internes', () => {
    expect(safeNext('/dashboard/mes-cartes')).toBe('/dashboard/mes-cartes'); expect(safeNext('/dashboard/proxnum?tab=rental')).toBe('/dashboard/proxnum?tab=rental');
    for (const bad of ['https://evil.com', '//evil.com', '/\\evil.com', 'javascript:alert(1)', '', null, undefined, '/login', '/register?x=1', '/verify-email', '/a\nb']) expect(safeNext(bad as any)).toBeNull();
  });
});
