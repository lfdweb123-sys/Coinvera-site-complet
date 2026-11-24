<?php
if (!defined('ABSPATH')) exit;

/** Coinvera COD ne conserve ni numéro de téléphone ni e-mail en clair : le journal ne garde que l'identifiant de
 *  commande et le résultat ; les compteurs de fiabilité sont indexés par un hachage (HMAC) irréversible du numéro
 *  et de l'e-mail, conservés 24 mois après la dernière activité. Le numéro est lu depuis la commande au moment de
 *  l'envoi, transmis à l'API Coinvera puis à Meta, jamais archivé par ce plugin. */
final class CVC_Privacy {
  public static function init() {
    add_action('admin_init', function () {
      if (function_exists('wp_add_privacy_policy_content'))
        wp_add_privacy_policy_content('Coinvera COD', wp_kses_post('<p>Pour les commandes payables à la livraison, Coinvera COD envoie un message WhatsApp au numéro renseigné à la commande afin de la faire confirmer. Ce numéro est transmis à l’API Coinvera puis à Meta (WhatsApp) au moment de l’envoi. Pour limiter les commandes fictives et les colis refusés, le plugin tient un score de fiabilité à partir de l’historique de la boutique (livraisons réussies, colis refusés, commandes non confirmées), associé à un identifiant haché et irréversible du numéro et de l’e-mail ; il ne contient aucune donnée lisible et est supprimé 24 mois après la dernière commande concernée.</p>'));
    });
  }
}
