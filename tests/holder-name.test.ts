import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/firebase-admin', () => ({ db: {} }));
vi.mock('@/lib/auth', () => ({ HttpError: class extends Error {} }));
vi.mock('@/lib/ledger', () => ({ postEntry: () => {}, readBal: async () => ({}), writeBal: () => {} }));
vi.mock('@/lib/audit', () => ({ notify: async () => {} }));
vi.mock('@/lib/log', () => ({ info: () => {}, warn: () => {}, error: () => {} }));
vi.mock('@/lib/scarab/client', () => ({ spx: async () => ({}), sp: async () => ({}), SpError: class extends Error {}, publicCode: () => 'x' }));
import { cardView, holderOf } from '@/lib/scarab/cards';
describe('titulaire affiché', () => {
  const cust = { firstName: ' Jean ', lastName: 'Dupont' };
  it('nom imprimé sur la carte en priorité', () => expect(holderOf({ nameOnCard: 'MARIE CURIE' }, cust)).toBe('MARIE CURIE'));
  it('sinon nom complet du titulaire vérifié', () => { expect(holderOf({ nameOnCard: null }, cust)).toBe('Jean Dupont'); expect(holderOf({ nameOnCard: '  ' }, cust)).toBe('Jean Dupont'); });
  it('aucun nom connu : null (le type de carte sert de repli à l’affichage)', () => { expect(holderOf({}, null)).toBeNull(); expect(holderOf({}, { firstName: 'Jean' })).toBe('Jean'); });
  it('cardView expose holderName', () => expect(cardView({ cardId: 'a', nameOnCard: null }, cust).holderName).toBe('Jean Dupont'));
});
