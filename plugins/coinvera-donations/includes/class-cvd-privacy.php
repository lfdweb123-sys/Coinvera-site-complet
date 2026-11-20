<?php
if (!defined('ABSPATH')) exit;

/** Outils RGPD de WordPress (Outils → Exporter / Effacer les données personnelles). */
final class CVD_Privacy {
  public static function init() {
    add_filter('wp_privacy_personal_data_exporters', function ($e) { $e['coinvera-donations'] = ['exporter_friendly_name' => 'Dons Coinvera', 'callback' => [__CLASS__, 'export']]; return $e; });
    add_filter('wp_privacy_personal_data_erasers', function ($e) { $e['coinvera-donations'] = ['eraser_friendly_name' => 'Dons Coinvera', 'callback' => [__CLASS__, 'erase']]; return $e; });
    add_action('admin_init', function () {
      if (function_exists('wp_add_privacy_policy_content'))
        wp_add_privacy_policy_content('Coinvera Donations', wp_kses_post('<p>Lorsqu’un visiteur fait un don, nous enregistrons le montant, et, s’il les renseigne, son nom, son adresse e-mail et son message. Le paiement par carte est traité par Coinvera : les données de carte ne passent jamais par ce site.</p>'));
    });
  }
  public static function export($email, $page = 1) {
    $items = [];
    foreach (CVD_DB::by_email(sanitize_email($email), (int) $page, 100) as $r) $items[] = ['group_id' => 'cvd-donations', 'group_label' => 'Dons', 'item_id' => 'cvd-' . $r->id, 'data' => [
      ['name' => 'Date', 'value' => get_date_from_gmt($r->created_at, 'Y-m-d H:i')], ['name' => 'Montant', 'value' => CVD_Util::money($r->amount_cents)], ['name' => 'Nom', 'value' => $r->donor_name],
      ['name' => 'Message', 'value' => $r->message], ['name' => 'Statut', 'value' => $r->status]]];
    return ['data' => $items, 'done' => count($items) < 100];
  }
  public static function erase($email, $page = 1) {
    $n = CVD_DB::anonymize_email(sanitize_email($email));   // le montant est conservé (obligation comptable), les données personnelles sont effacées
    return ['items_removed' => $n > 0, 'items_retained' => false, 'messages' => $n ? ['Les données personnelles de ' . $n . ' don(s) ont été effacées ; le montant est conservé à titre comptable.'] : [], 'done' => true];
  }
}
