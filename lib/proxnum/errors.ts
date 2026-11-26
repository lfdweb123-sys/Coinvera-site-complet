// Messages d'erreur du module ProxNum (sûr côté client : aucune dépendance serveur).
// Les codes viennent soit de Coinvera, soit de l'API ProxNum (voir la référence : no_numbers, insufficient_balance, cancel_rejected, price_changed, window_closed, sms_received, extended, cancel_pending, not_active, invalid_period, option_unavailable, unavailable, provider_unreachable).
export const PX_ERR: Record<string, string> = {
  proxnum_disabled: 'Les numéros virtuels ne sont pas encore disponibles.',
  no_numbers: 'Aucun numéro disponible pour ce service dans ce pays. Vous n’avez pas été débité.',
  price_changed: 'Le prix a changé. Vérifiez le nouveau prix puis recommencez. Vous n’avez pas été débité.',
  service_unavailable: 'Le service est momentanément indisponible. Vous n’avez pas été débité : réessayez plus tard.',
  unavailable: 'Le service est momentanément indisponible. Vous n’avez pas été débité : réessayez plus tard.',
  provider_unreachable: 'Le service ne répond pas. Si votre achat a bien eu lieu, il sera confirmé ou remboursé automatiquement.',
  insufficient_funds: 'Le service est momentanément indisponible. Vous n’avez pas été débité : réessayez plus tard.',
  invalid_period: 'Durée de location invalide.', option_unavailable: 'Cette option n’est plus disponible.',
  cancel_rejected: 'Annulation impossible : un SMS a déjà été reçu ou le numéro n’est plus remboursable.',
  window_closed: 'Annulation impossible : le délai de 2 minutes après l’achat est dépassé.',
  sms_received: 'Annulation impossible : ce numéro a déjà reçu un SMS.',
  extended: 'Annulation impossible : une location prolongée ne peut plus être annulée.',
  cancel_pending: 'Une annulation est déjà en cours : le remboursement arrivera dès sa confirmation.',
  not_active: 'Cette location n’est plus active.',
  order_state: 'Action impossible dans l’état actuel de cette commande.',
  not_found: 'Commande introuvable.',
};
