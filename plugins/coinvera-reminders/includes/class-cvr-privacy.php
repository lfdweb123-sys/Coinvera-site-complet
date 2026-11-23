<?php
if (!defined('ABSPATH')) exit;

/** Coinvera Reminders ne conserve aucune donnée personnelle dans ses propres tables : son journal (CVR_DB) ne garde
 *  que l'identifiant de commande, le type de relance et le résultat. Le numéro de téléphone est lu depuis la commande
 *  WooCommerce au moment de l'envoi, transmis à l'API Coinvera, puis à Meta — jamais stocké par ce plugin. Les outils
 *  RGPD de WordPress (export/effacement) s'appliquent déjà à la commande elle-même via WooCommerce. */
final class CVR_Privacy {
  public static function init() {
    add_action('admin_init', function () {
      if (function_exists('wp_add_privacy_policy_content'))
        wp_add_privacy_policy_content('Coinvera Reminders', wp_kses_post('<p>Coinvera Reminders peut envoyer, par WhatsApp, un rappel si une commande reste en attente de paiement (avec votre accord explicite donné au moment de la commande) et des notifications de suivi de commande. Le numéro de téléphone utilisé est celui renseigné à la commande ; il est transmis à l’API Coinvera puis à Meta (WhatsApp) au moment de l’envoi et n’est pas conservé par ce plugin au-delà de la commande elle-même.</p>'));
    });
  }
}
