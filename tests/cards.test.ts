import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CARD_DEFAULTS, markupOf } from '@/lib/cards/settings';
import { verifySignature } from '@/lib/cards/webhook';
import { isDefinitive, CiError, CiUnknown } from '@/lib/cards/cryptoinfra';
describe('marge cartes', () => {
  it('émission : fixe + points de base sur le solde d’ouverture', () => {
    expect(markupOf({ ...CARD_DEFAULTS, issueFlat: 1, issueBps: 100 }, 'issue', 50_000_000)).toBe(1_500_000);
    expect(markupOf({ ...CARD_DEFAULTS, issueFlat: 0, issueBps: 0 }, 'issue', 50_000_000)).toBe(0);
  });
  it('recharge : fixe + points de base sur le montant', () => {
    expect(markupOf({ ...CARD_DEFAULTS, loadFlat: 0.25, loadBps: 100 }, 'topup', 100_000_000)).toBe(1_250_000);
  });
  it('le service est désactivé par défaut', () => { expect(CARD_DEFAULTS.enabled).toBe(false); });
});
describe('signature du webhook cartes', () => {
  const raw = '{"cardId":1,"userExternalId":"123456789"}', secret = 'whsec_test';
  const sig = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  it('accepte la bonne signature', () => { expect(verifySignature(raw, sig, secret)).toBe(true); });
  it('refuse un corps modifié, une mauvaise clé ou une signature vide', () => {
    expect(verifySignature(raw + ' ', sig, secret)).toBe(false);
    expect(verifySignature(raw, sig, 'autre')).toBe(false);
    expect(verifySignature(raw, '', secret)).toBe(false);
  });
});
describe('échec définitif ou inconnu', () => {
  it('seul un refus explicite libère les fonds', () => {
    expect(isDefinitive(new CiError(409, 'provider_rejected'))).toBe(true);
    expect(isDefinitive(new CiError(503, 'cards_maintenance'))).toBe(true);
    expect(isDefinitive(new CiUnknown())).toBe(false);
    expect(isDefinitive(new Error('timeout'))).toBe(false);
  });
});
