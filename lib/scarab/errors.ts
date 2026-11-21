// Messages d'erreur de la Carte Pro (sûr côté client : aucune dépendance serveur, aucun nom de prestataire).
export const SCARAB_ERR: Record<string, string> = {
  scarab_disabled: 'La Carte Pro n’est pas encore disponible.', scarab_not_configured: 'Le service Carte Pro est en cours de configuration.',
  scarab_unavailable: 'Service momentanément indisponible : réessayez plus tard. Vous n’avez pas été débité.',
  scarab_unreachable: 'Le service ne répond pas. Si vous avez été débité, l’opération sera confirmée ou remboursée automatiquement.',
  scarab_busy: 'La carte a besoin d’une courte pause entre deux opérations (environ 2 minutes entre deux recharges). Réessayez dans un instant.',
  scarab_price_below_cost: 'Tarif momentanément indisponible. Réessayez plus tard : vous n’avez pas été débité.',
  scarab_customer_exists: 'Votre dossier de vérification existe déjà.', scarab_customer_missing: 'Dossier de vérification introuvable : recommencez la vérification.',
  scarab_customer_limit: 'Vous avez déjà 3 cartes actives. Fermez-en une pour en créer une nouvelle.',
  scarab_termination_blocked: 'Une carte ne peut être fermée que 24 heures après sa création. Vous pouvez la geler en attendant.',
  scarab_details_unavailable: 'Les détails de la carte sont momentanément indisponibles. Réessayez dans une minute.',
  scarab_wrong_state: 'Action impossible dans l’état actuel.', kyc_not_approved: 'Votre identité doit d’abord être vérifiée avant de créer une carte.',
  customer_required: 'Complétez d’abord votre vérification d’identité.', name_required: 'Indiquez le nom à afficher sur la carte (2 à 50 lettres).',
  card_not_found: 'Carte introuvable.', product_not_found: 'Ce type de carte n’est plus proposé.', card_state: 'Action impossible dans l’état actuel de la carte.',
  provider_rejected: 'La demande a été refusée par l’émetteur. Vous n’avez pas été débité.', invalid_amount: 'Montant invalide, ou hors des limites de cette carte.',
  validation_error: 'Certaines informations sont invalides ou manquantes : vérifiez le formulaire.', underage: 'Vous devez avoir au moins 18 ans.',
  document_required: 'La photo de la pièce d’identité est obligatoire pour ce type de document.', document_not_allowed: 'Ce type de pièce ne se vérifie pas avec une photo.', country_mismatch: 'Ce type de pièce exige le pays Nigéria (NGA).',
  code_expired: 'Ce code a expiré.' };
