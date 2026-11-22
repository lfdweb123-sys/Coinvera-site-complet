<?php
if (!defined('ABSPATH')) exit;

/** Outils RGPD de WordPress. */
final class CVT_Privacy {
  public static function init() {
    add_filter('wp_privacy_personal_data_exporters', function ($e) { $e['coinvera-tickets'] = ['exporter_friendly_name' => 'Billetterie Coinvera', 'callback' => [__CLASS__, 'export']]; return $e; });
    add_filter('wp_privacy_personal_data_erasers', function ($e) { $e['coinvera-tickets'] = ['eraser_friendly_name' => 'Billetterie Coinvera', 'callback' => [__CLASS__, 'erase']]; return $e; });
    add_action('admin_init', function () {
      if (function_exists('wp_add_privacy_policy_content'))
        wp_add_privacy_policy_content('Coinvera Tickets', wp_kses_post('<p>Lors d’un achat de billets, nous enregistrons le nom, l’adresse e-mail, les billets achetés et le montant. Les billets contiennent un code utilisé pour le contrôle à l’entrée. Le paiement par carte est traité par Coinvera : les données de carte ne passent jamais par ce site.</p>'));
    });
  }
  public static function export($email, $page = 1) {
    $items = [];
    foreach (CVT_DB::orders_by_email(sanitize_email($email), (int) $page, 100) as $o) {
      $ev = CVT_Events::get($o->event_id); $d = [['name' => 'Événement', 'value' => $ev ? $ev['title'] : '#' . $o->event_id], ['name' => 'Nom', 'value' => $o->buyer_name], ['name' => 'Montant', 'value' => CVT_Util::money($o->total_cents)], ['name' => 'Statut', 'value' => $o->status], ['name' => 'Date', 'value' => $o->created_at]];
      foreach (CVT_DB::tickets_of($o->id) as $t) $d[] = ['name' => 'Billet ' . $t->type_name, 'value' => $t->holder_name . ' — ' . $t->status];
      $items[] = ['group_id' => 'cvt-orders', 'group_label' => 'Commandes de billets', 'item_id' => 'cvt-' . $o->id, 'data' => $d];
    }
    return ['data' => $items, 'done' => count($items) < 100];
  }
  public static function erase($email, $page = 1) {
    $n = CVT_DB::anonymize_email(sanitize_email($email));   // montants, dates et validité des codes conservés (comptabilité, contrôle d'entrée)
    return ['items_removed' => $n > 0, 'items_retained' => false, 'messages' => $n ? ['Les données personnelles de ' . $n . ' commande(s) ont été effacées ; montants et dates sont conservés à titre comptable.'] : [], 'done' => true];
  }
}
