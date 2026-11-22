// Messages d'erreur du module cartes (sûr côté client : aucune dépendance serveur).
export const CARD_ERR: Record<string, string> = {
  cards_disabled: 'Les cartes ne sont pas encore disponibles.', cards_not_configured: 'Le service de cartes est en cours de configuration.',
  cards_maintenance: 'Émission et recharge de cartes en maintenance : réessayez un peu plus tard. Vous n’avez pas été débité.',
  cards_provider_unreachable: 'Le service de cartes ne répond pas. Si vous avez été débité, l’opération sera confirmée ou remboursée automatiquement.',
  kyc_not_approved: 'Vérifiez d’abord votre identité pour obtenir cette carte.', card_holder_required: 'Créez d’abord votre compte carte.',
  card_not_found: 'Carte introuvable.', product_not_found: 'Ce type de carte n’est plus proposé.', card_state: 'Action impossible dans l’état actuel de la carte.',
  card_issuing: 'La carte est en cours de création (quelques minutes).', provider_rejected: 'La demande a été refusée par l’émetteur. Vous n’avez pas été débité.',
  rail_unfunded: 'Service momentanément indisponible : réessayez plus tard. Vous n’avez pas été débité.', provider_unavailable: 'Service momentanément indisponible : réessayez plus tard.',
  card_rail_unavailable: 'Cette carte est momentanément indisponible.', card_coins_not_on_chain: 'Opération momentanément impossible : réessayez dans quelques minutes.',
  email_taken: 'Cette adresse email est déjà utilisée pour un autre compte carte.', daily_limit_reached: 'Limite quotidienne atteinte, réessayez demain.',
  currency_unavailable: 'Ce mode de paiement n’est pas disponible.', invalid_amount: 'Montant invalide ou inférieur au minimum de cette carte.', validation_error: 'Données invalides.',
  // Codes CryptoInfra documentés (compte, projet, utilisateur) : l'utilisateur voit un message neutre, l'administrateur trouve la cause exacte dans Admin > Virtual Cards et dans les journaux.
  unauthorized: 'Le service de cartes est en cours de configuration. Réessayez plus tard.', account_paused: 'Le service de cartes est momentanément suspendu. Réessayez plus tard.', account_suspended: 'Le service de cartes est momentanément indisponible.',
  email_unverified: 'Le service de cartes est en cours de configuration. Réessayez plus tard.', project_paused: 'Le service de cartes est momentanément suspendu. Réessayez plus tard.', project_suspended: 'Le service de cartes est momentanément indisponible.',
  user_not_found: 'Votre compte carte n’est pas encore prêt : réessayez dans un instant.', holder_not_found: 'Votre compte carte n’est pas encore prêt : réessayez dans un instant.', user_id_taken: 'Votre compte carte n’a pas pu être créé : réessayez dans un instant.',
  provider_error: 'Le service de cartes a répondu par une erreur. Réessayez plus tard.', not_found: 'Introuvable.', internal_error: 'Erreur interne du service. Réessayez dans un instant.', rate_limited: 'Trop de tentatives, réessayez plus tard.', id_generation_failed: 'Création du compte carte impossible pour le moment. Réessayez.',
  forbidden: 'Accès refusé.', network_unavailable: 'Réseau momentanément indisponible, réessayez.' };
