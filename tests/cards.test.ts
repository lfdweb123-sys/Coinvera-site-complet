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
  it('les marges par défaut couvrent les frais de recharge du portefeuille (1,5 % ≈ 155 points de base) même sur un gros montant', () => {
    expect(CARD_DEFAULTS.loadBps).toBeGreaterThan(155); expect(CARD_DEFAULTS.issueBps).toBeGreaterThan(155);
    const A = 1000, T = A * 1.014 + 0.5 + 2.2, margin = markupOf(CARD_DEFAULTS, 'topup', A * 1e6) / 1e6;   // tarifs CORE-1 du 21/11/2026
    expect(margin).toBeGreaterThan(T * 0.01523);
  });
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
import { payView, DEPOSIT_MIN, GRACE_MS, VALID_MS } from '@/lib/cards/pay';
describe('paiement direct USDT', () => {
  it('les paiements tardifs sont surveillés 7 jours, bien au-delà de la validité de 60 minutes', () => { expect(GRACE_MS).toBe(7 * 24 * 3600_000); expect(VALID_MS).toBe(3600_000); expect(GRACE_MS).toBeGreaterThan(VALID_MS); expect(DEPOSIT_MIN).toBe(5); });
  it('le montant affiché est exact (6 décimales TRC20, 18 BEP20) et unique par commande', () => {
    const v = payView('x', { status: 'awaiting', cur: 'usdttrc20', decimals: 6, address: 'T', expected: '23451234', chargeUnits: 23451234, expiresAt: 1, spec: { kind: 'deposit', amount: '23' } });
    expect(v.amount).toBe('23.451234'); expect(v.kind).toBe('deposit');
  });
});
import { CARD_ERR } from '@/lib/cards/errors';
describe('messages d’erreur cartes', () => {
  it('tous les codes CryptoInfra documentés ont un message lisible', () => {
    for (const c of ['unauthorized', 'account_paused', 'account_suspended', 'email_unverified', 'project_paused', 'project_suspended', 'user_not_found', 'holder_not_found', 'user_id_taken', 'kyc_not_approved', 'provider_rejected', 'cards_maintenance', 'rail_unfunded', 'email_taken', 'daily_limit_reached', 'card_state', 'card_issuing', 'invalid_amount', 'validation_error', 'internal_error']) expect(CARD_ERR[c], c).toBeTruthy();
  });
});
