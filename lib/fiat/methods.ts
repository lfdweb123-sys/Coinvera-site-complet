import type { FiatCur } from './quote';
// Moyens de paiement FeexPay (API v2) proposés pour les cartes. XOF et XAF (Congo) sont à parité fixe 1:1 : même taux, affichés « FCFA ».
export type Flow = 'push' | 'otp' | 'coris' | 'bmo' | 'bank_transfer' | 'bank_redirect';
export type Method = { id: string; cc: string; country: string; name: string; cur: FiatCur; label: 'FCFA' | 'NGN'; flow: Flow; min: number; max: number; dial?: string; digits?: [number, number]; names?: boolean; returnUrl?: boolean; otpLabel?: string };
const X = (id: string, cc: string, country: string, name: string, dial: string, digits: [number, number], o: Partial<Method> = {}): Method => ({ id, cc, country, name, cur: 'XOF', label: 'FCFA', flow: 'push', min: 100, max: 2_000_000, dial, digits, ...o });
export const METHODS: Method[] = [
  X('mtn', 'BJ', 'Bénin', 'MTN Mobile Money', '229', [13, 13]), X('moov', 'BJ', 'Bénin', 'Moov Money', '229', [13, 13]), X('celtiis_bj', 'BJ', 'Bénin', 'Celtiis Cash', '229', [13, 13]),
  X('coris', 'BJ', 'Bénin', 'Coris Money', '229', [13, 13], { flow: 'coris', otpLabel: 'Code reçu par SMS' }),
  X('bmo', 'BJ', 'Bénin', 'B-MO', '229', [13, 13], { flow: 'bmo', min: 200, names: true, otpLabel: 'Code reçu par SMS (valable 1 minute)' }),
  X('moov_tg', 'TG', 'Togo', 'Moov Money', '228', [11, 11], { names: true }), X('togocom_tg', 'TG', 'Togo', 'Togocom (T-Money)', '228', [11, 11], { names: true }),
  X('mtn_ci', 'CI', 'Côte d’Ivoire', 'MTN Mobile Money', '225', [13, 13]), X('moov_ci', 'CI', 'Côte d’Ivoire', 'Moov Money', '225', [13, 13], { returnUrl: true }),
  X('orange_ci', 'CI', 'Côte d’Ivoire', 'Orange Money', '225', [13, 13], { returnUrl: true }), X('wave_ci', 'CI', 'Côte d’Ivoire', 'Wave', '225', [13, 13], { returnUrl: true }),
  X('djamo_ci', 'CI', 'Côte d’Ivoire', 'Djamo', '225', [13, 13], { returnUrl: true, min: 100 }),
  X('mtn_cg', 'CG', 'Congo-Brazzaville', 'MTN Mobile Money', '242', [12, 15]),
  X('orange_sn', 'SN', 'Sénégal', 'Orange Money', '221', [12, 12], { returnUrl: true }), X('wave_sn', 'SN', 'Sénégal', 'Wave', '221', [12, 12], { returnUrl: true }), X('free_sn', 'SN', 'Sénégal', 'Free Money', '221', [12, 12], { returnUrl: true }),
  X('moov_bf', 'BF', 'Burkina Faso', 'Moov Money', '226', [11, 11]), X('wave_bf', 'BF', 'Burkina Faso', 'Wave', '226', [11, 11]),
  X('orange_bf', 'BF', 'Burkina Faso', 'Orange Money', '226', [11, 11], { flow: 'otp', otpLabel: 'Code OTP généré avec le code USSD ci-dessus' }),
  { id: 'bank_transfer_ng', cc: 'NG', country: 'Nigéria', name: 'Virement bancaire (compte temporaire)', cur: 'NGN', label: 'NGN', flow: 'bank_transfer', min: 100, max: 10_000_000 },
  { id: 'pay_with_bank_ng', cc: 'NG', country: 'Nigéria', name: 'Pay with Bank (Opay, PalmPay…)', cur: 'NGN', label: 'NGN', flow: 'bank_redirect', min: 200, max: 10_000_000, returnUrl: true },
];
export const methodById = (id: string) => METHODS.find(m => m.id === id);
/** Numéro au format attendu par FeexPay, ou null. B-MO : numéro LOCAL béninois avec son 0 initial (10 chiffres), sans indicatif. */
export function normalizePhone(m: Method, raw: string): string | null {
  let d = String(raw ?? '').replace(/[^\d]/g, ''); if (d.startsWith('00')) d = d.slice(2); if (!m.dial || !m.digits) return null;
  if (m.id === 'bmo') { if (d.startsWith(m.dial) && d.length === 13) d = d.slice(3); return /^0\d{9}$/.test(d) ? d : null; }
  const [lo, hi] = m.digits; const full = d.startsWith(m.dial) && d.length >= lo && d.length <= hi ? d : m.dial + d;
  return full.length >= lo && full.length <= hi ? full : null;
}
export const needsPhone = (m: Method) => m.flow !== 'bank_transfer' && m.flow !== 'bank_redirect';
export const methodView = (m: Method) => ({ id: m.id, cc: m.cc, country: m.country, name: m.name, label: m.label, flow: m.flow, min: m.min, otpLabel: m.otpLabel ?? null, phone: needsPhone(m), dial: m.dial ?? null });
