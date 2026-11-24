<?php
if (!defined('ABSPATH')) exit;

/** Coinvera Installments ne conserve aucune donnée personnelle dans ses propres tables : la liste des échéances ne
 *  contient que des identifiants de commande, des montants et des dates. Les coordonnées du client sont lues depuis la
 *  commande WooCommerce au moment de l'envoi (e-mail, et WhatsApp si activé : transmis à l'API Coinvera puis à Meta). */
final class CVP_Privacy {
  public static function init() {
    add_action('admin_init', function () {
      if (function_exists('wp_add_privacy_policy_content'))
        wp_add_privacy_policy_content('Coinvera Installments', wp_kses_post('<p>Lorsque vous choisissez de payer en plusieurs fois, la boutique vous envoie, à chaque échéance, un lien de paiement par e-mail et, si cette option est activée, par WhatsApp au numéro renseigné à la commande. Ce numéro est transmis à l’API Coinvera puis à Meta (WhatsApp) au moment de l’envoi. Le plugin ne conserve que l’identifiant de commande, les montants et les dates d’échéance.</p>'));
    });
  }
}
