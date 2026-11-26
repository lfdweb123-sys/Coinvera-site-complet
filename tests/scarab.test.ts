import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalQuery, canonicalString, signCanonical, sha256hex, outcomeOf, publicCode, SpError, SpUnknown } from '@/lib/scarab/client';
import { STARTER, categoryOf, customerFee, feeOf, liveCost } from '@/lib/scarab/pricing';
import { SCARAB_DEFAULTS, pricingOf } from '@/lib/scarab/settings';
import { verifyWebhook, parseSignature } from '@/lib/scarab/webhook';
import { CUSTOMER_FIELDS, checkDocs, normalizeSlug } from '@/lib/scarab/customers';
import { HttpError } from '@/lib/auth';

// Exemple de référence publié dans la documentation ScarabPay : mêmes entrées, même signature.
describe('signature des requêtes ScarabPay (exemple de la documentation)', () => {
  const secret = 'qZ9m4TbN1sVfK7hLpR2dXwE5yA8cJ3uG6oI0nB4tS1k=', keyId = '01KA7Y2M6Q4RXHB9WD3F5NTC8V', ts = '1787000400', nonce = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
  const body = '{"product_id":"01KA7XQ8V3ZP5M2CJ9B6TDNF4H","customer_id":"01KA7XR4W9YT6N3DK8C2QFMH5J","amount_minor":2500}';
  it('hash du corps', () => { expect(sha256hex(body)).toBe('97dda525220128a1b9a3e8bbf0e3000b6aab4751cd86df8b427b652729e54062'); });
  it('chaîne canonique : 7 lignes, 6 \\n, ligne de requête vide, pas de \\n final', () => {
    const c = canonicalString({ method: 'post', path: '/api/v1/cards', query: '', keyId, ts, nonce, body });
    expect(c).toBe(['POST', '/api/v1/cards', '', keyId, ts, nonce, '97dda525220128a1b9a3e8bbf0e3000b6aab4751cd86df8b427b652729e54062'].join('\n'));
    expect(c.split('\n')).toHaveLength(7); expect(c.endsWith('\n')).toBe(false);
  });
  it('signature identique à celle de la documentation', () => {
    const c = canonicalString({ method: 'POST', path: '/api/v1/cards', query: '', keyId, ts, nonce, body });
    expect(signCanonical(secret, c)).toBe('f2HPicoyBZ26PG1LT6B97MDk/JdbfmUVcUyqDf5vNGg=');
  });
  it('corps vide : hash de la chaîne vide', () => { expect(sha256hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'); });
});
describe('chaîne de requête canonique', () => {
  it('triée par clé (cursor avant per_page), valeurs absentes ignorées', () => { expect(canonicalQuery({ per_page: 50, cursor: 'abc' })).toBe('cursor=abc&per_page=50'); expect(canonicalQuery({ a: undefined, b: 1 })).toBe('b=1'); expect(canonicalQuery()).toBe(''); });
  it('encode chaque côté, espace = +', () => { expect(canonicalQuery({ q: 'a b' })).toBe('q=a+b'); expect(canonicalQuery({ cursor: 'eyJpZCI6MjB9==' })).toBe('cursor=eyJpZCI6MjB9%3D%3D'); });
});

describe('signature des webhooks ScarabPay (exemple de la documentation)', () => {
  const secret = 'Yv8Qk3mR7pTz1LbN5wX2dJ9sH6cF4gA0uE8iO2nB4tS=', t = 1787000400;
  const body = '{"type":"card.issued","occurred_at":"2026-08-17T21:00:00+00:00","data":{"card_id":"01KA7Y5T8B2VQD6MJ4H9CFNX3P"}}';
  const v1 = '8537115a69c4fb3b86c5b472b5123e527c2dd0c7b4b609ed212fe7962f6df75b', header = `t=${t}, v1=${v1}`;
  it('accepte la signature de la documentation', () => { expect(verifyWebhook(body, header, secret, t * 1000)).toBe(true); });
  it('refuse un corps modifié, une mauvaise clé, une signature vide ou mal formée', () => {
    expect(verifyWebhook(body + ' ', header, secret, t * 1000)).toBe(false); expect(verifyWebhook(body, header, 'autre', t * 1000)).toBe(false);
    expect(verifyWebhook(body, '', secret, t * 1000)).toBe(false); expect(verifyWebhook(body, 'v1=abc', secret, t * 1000)).toBe(false);
  });
  it('refuse un horodatage trop ancien ou trop lointain', () => { expect(verifyWebhook(body, header, secret, (t + 3600) * 1000)).toBe(false); expect(verifyWebhook(body, header, secret, (t - 3600) * 1000)).toBe(false); expect(verifyWebhook(body, header, secret, (t + 600) * 1000)).toBe(true); });
  it('lit l’en-tête', () => { expect(parseSignature(header)).toEqual({ t, v1 }); expect(parseSignature('n’importe quoi')).toBeNull(); });
  it('même HMAC que celui calculé à la main', () => { expect(crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')).toBe(v1); });
});

describe('tarifs : prix fixes = Starter + marge, jamais à perte', () => {
  // Tableaux « Card creation » / « Card funding » du plan Starter (page Choose your plan).
  it('reproduit exactement les exemples du plan Starter (Virtual et Contactless)', () => {
    for (const [a, fee] of [[1000, 250], [10000, 250], [20000, 350], [50000, 650]]) expect(feeOf(STARTER.standard.issue, a)).toBe(fee);
    for (const [a, fee] of [[1000, 175], [10000, 175], [20000, 275], [50000, 575]]) expect(feeOf(STARTER.standard.topup, a)).toBe(fee);
  });
  it('Platinum Starter : 1 $ + 1 % (min 1 $) à la création, 1 % (min 0,50 $) à la recharge', () => { expect(feeOf(STARTER.platinum.issue, 500)).toBe(200); expect(feeOf(STARTER.platinum.issue, 20000)).toBe(300); expect(feeOf(STARTER.platinum.topup, 2000)).toBe(50); expect(feeOf(STARTER.platinum.topup, 10000)).toBe(100); });
  it('arrondi au centime supérieur', () => { expect(feeOf({ fixed: 0, bps: 75, min: 0 }, 101)).toBe(1); expect(feeOf({ fixed: 0, bps: 100, min: 0 }, 150)).toBe(2); });
  it('reconnaît Platinum par le nom', () => { expect(categoryOf('Platinum Visa Card')).toBe('platinum'); expect(categoryOf('Virtual Visa Card')).toBe('standard'); expect(categoryOf('Contactless Visa Card')).toBe('standard'); });
  it('marges par défaut (2 $ + 2,5 % / 0,50 $ + 2,5 %) et service désactivé par défaut', () => { expect(SCARAB_DEFAULTS.enabled).toBe(false); expect(pricingOf(SCARAB_DEFAULTS)).toEqual({ issue: { flatMinor: 200, bps: 250 }, topup: { flatMinor: 50, bps: 250 } }); });
  it('marge : fixe + points de base sur le montant', () => {
    const m = pricingOf({ ...SCARAB_DEFAULTS, issueFlat: 1, issueBps: 100, loadFlat: 0.25, loadBps: 50 });
    expect(customerFee('issue', 'standard', 5000, m.issue)).toBe(250 + 100 + 50); expect(customerFee('topup', 'standard', 10000, m.topup)).toBe(175 + 25 + 50);
  });
  // Plans suivants (page Choose your plan), exprimés comme `fees` de GET /products. Le prix Starter doit être >= au coût sur chaque ligne du tableau.
  const PLANS = {
    growth: { issue_fixed_minor: 125, issue_bps: 100, issue_min_minor: 100, recharge_fixed_minor: 50, recharge_bps: 100, recharge_min_minor: 100 },
    scale: { issue_fixed_minor: 100, issue_bps: 75, issue_min_minor: 75, recharge_fixed_minor: 40, recharge_bps: 75, recharge_min_minor: 75 },
    pro: { issue_fixed_minor: 100, issue_bps: 50, issue_min_minor: 50, recharge_fixed_minor: 25, recharge_bps: 50, recharge_min_minor: 50 },
    starter: { issue_fixed_minor: 150, issue_bps: 100, issue_min_minor: 100, recharge_fixed_minor: 75, recharge_bps: 100, recharge_min_minor: 100 },
  };
  it('Starter, Growth, Scale et Pro : le prix fixe (marge 0) couvre toujours le coût Virtual/Contactless', () => {
    const m = pricingOf(SCARAB_DEFAULTS);
    for (const [name, fees] of Object.entries(PLANS)) for (const a of [500, 1000, 2500, 5000, 10000, 10001, 20000, 50000, 100000, 250000]) {
      expect(customerFee('issue', 'standard', a, m.issue), `${name} création ${a}`).toBeGreaterThanOrEqual(liveCost('issue', fees, a));
      expect(customerFee('topup', 'standard', a, m.topup), `${name} recharge ${a}`).toBeGreaterThanOrEqual(liveCost('topup', fees, a));
    }
  });
  it('Platinum : même garantie sur les quatre plans', () => {
    const P = { starter: { issue_fixed_minor: 100, issue_bps: 100, issue_min_minor: 100, recharge_fixed_minor: 0, recharge_bps: 100, recharge_min_minor: 50 }, growth: { issue_fixed_minor: 150, issue_bps: 0, issue_min_minor: 0, recharge_fixed_minor: 0, recharge_bps: 75, recharge_min_minor: 40 },
      scale: { issue_fixed_minor: 125, issue_bps: 0, issue_min_minor: 0, recharge_fixed_minor: 0, recharge_bps: 50, recharge_min_minor: 25 }, pro: { issue_fixed_minor: 100, issue_bps: 0, issue_min_minor: 0, recharge_fixed_minor: 0, recharge_bps: 25, recharge_min_minor: 0 } };
    const m = pricingOf(SCARAB_DEFAULTS);
    for (const [name, fees] of Object.entries(P)) for (const a of [500, 1000, 2500, 5000, 10000, 20000, 50000, 250000]) {
      expect(customerFee('issue', 'platinum', a, m.issue), `${name} création ${a}`).toBeGreaterThanOrEqual(liveCost('issue', fees, a));
      expect(customerFee('topup', 'platinum', a, m.topup), `${name} recharge ${a}`).toBeGreaterThanOrEqual(liveCost('topup', fees, a));
    }
  });
  it('un coût illisible est refusé plutôt que deviné', () => { expect(() => liveCost('issue', { issue_fixed_minor: 'abc' }, 1000)).toThrow(); });
});

describe('échec définitif, à réessayer, ou inconnu', () => {
  it('seul un refus explicite libère les fonds', () => {
    expect(outcomeOf(new SpError(422, 'card:issue_failed'))).toBe('definitive'); expect(outcomeOf(new SpError(422, 'balance:insufficient_funds'))).toBe('definitive');
    expect(outcomeOf(new SpError(403, 'plan:required'))).toBe('definitive'); expect(outcomeOf(new SpError(404, 'http_404'))).toBe('definitive');
    expect(outcomeOf(new HttpError(503, 'scarab_not_configured'))).toBe('definitive');
  });
  it('429, 503, nonce ou horloge : rien n’a bougé, on réessaie avec la même clé', () => {
    expect(outcomeOf(new SpError(429, 'card:provider_busy', {}, 30))).toBe('retry'); expect(outcomeOf(new SpError(503, 'card:temporarily_unavailable'))).toBe('retry');
    expect(outcomeOf(new SpError(409, 'gateway:replay_detected'))).toBe('retry'); expect(outcomeOf(new SpError(401, 'gateway:timestamp_out_of_window'))).toBe('retry');
  });
  it('timeout, 500 ou requête encore en cours : état inconnu, on GARDE la réservation', () => {
    expect(outcomeOf(new SpUnknown())).toBe('unknown'); expect(outcomeOf(new SpError(409, 'idempotency:in_flight'))).toBe('unknown'); expect(outcomeOf(new Error('boom'))).toBe('unknown');
  });
  it('les erreurs côté serveur ne fuient jamais le prestataire ni le détail interne', () => {
    expect(publicCode(new SpError(422, 'balance:insufficient_funds'))).toBe('scarab_unavailable'); expect(publicCode(new SpError(403, 'plan:card_limit_reached'))).toBe('scarab_unavailable');
    expect(publicCode(new SpError(422, 'customer:card_limit_reached'))).toBe('scarab_customer_limit'); expect(publicCode(new SpError(422, 'card:termination_blocked'))).toBe('scarab_termination_blocked');
    expect(publicCode(new SpError(429, 'card:provider_busy'))).toBe('scarab_busy'); expect(publicCode(new SpError(422, 'amount:below_minimum'))).toBe('invalid_amount');
  });
});

describe('dossier d’identité', () => {
  const ok = { first_name: 'Amina', last_name: 'Bello', email: 'amina.bello@example.test', phone_number: '8031234567', dial_code: '+234', date_of_birth: '1994-03-11', id_type: 'bvn', id_number: '12345678901', line1: '14 Adeola Odeku Street', city: 'Lagos', state: 'Lagos', postal_code: '101241', country: 'nga',
    occupation: 'Software Engineer', employment_status: 'Self Employed', account_purpose: 'personal_spending', annual_salary: '4800000', expected_monthly_volume: '150000', terms_of_service_accepted: true };
  it('accepte l’exemple de la documentation et normalise pays et libellés', () => { const r = CUSTOMER_FIELDS.parse(ok); expect(r.country).toBe('NGA'); expect(r.occupation).toBe('software_engineer'); expect(r.employment_status).toBe('self_employed'); });
  it('refuse un mineur, des conditions non acceptées, un salaire non numérique', () => {
    expect(() => CUSTOMER_FIELDS.parse({ ...ok, date_of_birth: '2015-01-01' })).toThrow(); expect(() => CUSTOMER_FIELDS.parse({ ...ok, terms_of_service_accepted: false })).toThrow(); expect(() => CUSTOMER_FIELDS.parse({ ...ok, annual_salary: '4 800 000' })).toThrow();
  });
  it('accents et espaces des libellés', () => { expect(normalizeSlug('Ingénieur  logiciel')).toBe('ingenieur_logiciel'); });
  it('règles par type de pièce : BVN/NIN sans photo et en NGA, passeport = recto seul, carte nationale = recto + verso', () => {
    expect(() => checkDocs({ id_type: 'bvn', country: 'NGA' })).not.toThrow(); expect(() => checkDocs({ id_type: 'bvn', country: 'BEN' })).toThrow(); expect(() => checkDocs({ id_type: 'nin', country: 'NGA', id_front_image: 'x' })).toThrow();
    expect(() => checkDocs({ id_type: 'passport', country: 'BEN' })).toThrow(); expect(() => checkDocs({ id_type: 'passport', country: 'BEN', id_front_image: 'x' })).not.toThrow(); expect(() => checkDocs({ id_type: 'passport', country: 'BEN', id_front_image: 'x', id_back_image: 'y' })).toThrow();
    expect(() => checkDocs({ id_type: 'national_id', country: 'BEN', id_front_image: 'x' })).toThrow(); expect(() => checkDocs({ id_type: 'national_id', country: 'BEN', id_front_image: 'x', id_back_image: 'y' })).not.toThrow();
  });
});

// Dépenses du mois affichées dans la liste des cartes : achats réglés moins remboursements, sans les autorisations en cours ni les refus.
import { sumSpent } from '@/lib/scarab/cards';
describe('dépenses du mois d\'une carte', () => {
  const start = Date.parse('2026-11-01T00:00:00Z'), tx = (type: string, amount: string, status: string, at: string) => ({ type, amount, status, at });
  it('compte les achats réglés, retranche les remboursements, ignore le reste', () => {
    const r = sumSpent([tx('Paiement', '17.99', 'completed', '2026-11-20T10:00:00Z'), tx('Paiement', '5.01', 'completed', '2026-11-03T10:00:00Z'), tx('Remboursement', '2.00', 'completed', '2026-11-21T10:00:00Z'),
      tx('Autorisation', '40.00', 'pending', '2026-11-22T10:00:00Z'), tx('Paiement refusé', '9.00', 'declined', '2026-11-22T10:00:00Z'), tx('Paiement', '8.00', 'pending', '2026-11-22T10:00:00Z'), tx('Rechargement', '50.00', 'completed', '2026-11-19T10:00:00Z')], start);
    expect(r).toEqual({ spent: 2100, older: false });
  });
  it('s\'arrête (older) dès qu\'une opération est antérieure au mois et ne la compte pas', () => {
    expect(sumSpent([tx('Paiement', '10.00', 'completed', '2026-11-02T00:00:00Z'), tx('Paiement', '99.00', 'completed', '2026-10-31T23:59:59Z')], start)).toEqual({ spent: 1000, older: true });
  });
});
