// Messages d'erreur du module eSIM (sûr côté client : aucune dépendance serveur).
export const ES_ERR: Record<string, string> = {
  esim_disabled: 'Les eSIM ne sont pas encore disponibles.',
  package_unavailable: 'Ce forfait n’est plus disponible. Vous n’avez pas été débité : choisissez-en un autre.',
  no_stock: 'Ce forfait est momentanément épuisé. Vous n’avez pas été débité : réessayez plus tard.',
  price_changed: 'Le prix a changé. Vérifiez le nouveau prix puis recommencez. Vous n’avez pas été débité.',
  service_unavailable: 'Le service est momentanément indisponible. Vous n’avez pas été débité : réessayez plus tard.',
  provider_unreachable: 'Le service ne répond pas. Si votre achat a bien eu lieu, il sera confirmé ou remboursé automatiquement.',
  cancel_rejected: 'Annulation impossible : cette eSIM a déjà été installée ou utilisée.',
  order_state: 'Action impossible dans l’état actuel de cette eSIM.',
  invalid_period: 'Durée invalide : choisissez entre 1 et 365 jours.',
  topup_unavailable: 'Cette recharge n’est pas disponible pour cette eSIM.',
  not_found: 'eSIM introuvable.',
};
