// Messages d'erreur des dépôts mobile money / virement (sûr côté client : aucune dépendance serveur, aucun nom de prestataire).
export const FIAT_ERR: Record<string, string> = {
  fiat_disabled: 'Le paiement par mobile money n’est pas encore disponible.', fiat_unavailable: 'Le paiement par mobile money est momentanément indisponible. Réessayez plus tard ou payez en crypto.',
  fx_unavailable: 'Le taux de change est momentanément indisponible. Réessayez dans quelques minutes.', invalid_method: 'Moyen de paiement inconnu.',
  invalid_phone: 'Numéro de téléphone invalide pour ce moyen de paiement. Vérifiez le pays et le nombre de chiffres.', otp_required: 'Saisissez le code OTP.', invalid_otp: 'Code incorrect ou expiré. Recommencez le paiement.',
  too_many_attempts: 'Trop d’essais. Recommencez le paiement.', invalid_bank: 'Banque non disponible.', too_many_pending: 'Vous avez déjà plusieurs paiements en attente. Terminez-les ou attendez leur expiration.',
  amount_too_low: 'Montant trop faible pour ce moyen de paiement.', amount_too_high: 'Montant trop élevé pour ce moyen de paiement : choisissez un montant plus petit.',
  payment_rejected: 'Le paiement a été refusé par l’opérateur. Vérifiez le numéro et le solde, puis réessayez.', payment_failed: 'Le paiement a échoué. Vous n’avez pas été débité.',
  provider_unavailable: 'Le service de paiement ne répond pas. Réessayez dans quelques instants.', provider_error: 'Le service de paiement a renvoyé une réponse inattendue. Vous n’avez pas été débité.',
  provider_timeout: 'Le service de paiement n’a pas répondu. Si vous avez été débité, contactez le support avec l’heure et le numéro utilisé.', reference_conflict: 'Conflit de paiement : contactez le support.',
  not_awaiting_code: 'Cette demande n’attend plus de code.', amount_mismatch: 'Le montant demandé par l’opérateur ne correspond pas : paiement annulé.',
};
