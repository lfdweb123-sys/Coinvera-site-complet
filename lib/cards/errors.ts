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
  forbidden: 'Accès refusé.', network_unavailable: 'Réseau momentanément indisponible, réessayez.' };
