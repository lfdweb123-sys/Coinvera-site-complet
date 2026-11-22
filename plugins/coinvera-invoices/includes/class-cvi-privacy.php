<?php
if (!defined('ABSPATH')) exit;

/** Outils RGPD de WordPress (Outils → Exporter / Effacer les données personnelles). */
final class CVI_Privacy {
  public static function init() {
    add_filter('wp_privacy_personal_data_exporters', function ($e) { $e['coinvera-invoices'] = ['exporter_friendly_name' => 'Factures Coinvera', 'callback' => [__CLASS__, 'export']]; return $e; });
    add_filter('wp_privacy_personal_data_erasers', function ($e) { $e['coinvera-invoices'] = ['eraser_friendly_name' => 'Factures Coinvera', 'callback' => [__CLASS__, 'erase']]; return $e; });
    add_action('admin_init', function () {
      if (function_exists('wp_add_privacy_policy_content'))
        wp_add_privacy_policy_content('Coinvera Invoices', wp_kses_post('<p>Les factures contiennent le nom, l’adresse e-mail et l’adresse postale du client, ainsi que le détail de la prestation. Elles sont conservées pour répondre aux obligations comptables. Le paiement par carte est traité par Coinvera : les données de carte ne passent jamais par ce site.</p>'));
    });
  }
  public static function export($email, $page = 1) {
    $items = [];
    foreach (CVI_DB::by_email(sanitize_email($email), (int) $page, 100) as $r) $items[] = ['group_id' => 'cvi-invoices', 'group_label' => 'Factures', 'item_id' => 'cvi-' . $r->id, 'data' => [
      ['name' => 'Numéro', 'value' => $r->number], ['name' => 'Date', 'value' => $r->issue_date], ['name' => 'Nom', 'value' => $r->customer_name],
      ['name' => 'Adresse', 'value' => $r->customer_address], ['name' => 'Total', 'value' => CVI_Util::money($r->total_cents)], ['name' => 'Statut', 'value' => $r->status]]];
    return ['data' => $items, 'done' => count($items) < 100];
  }
  /** Les factures sont des pièces comptables : elles ne sont pas effacées, ce que l'outil indique clairement. */
  public static function erase($email, $page = 1) {
    $n = count(CVI_DB::by_email(sanitize_email($email), 1, 1));
    return ['items_removed' => false, 'items_retained' => $n > 0, 'messages' => $n ? ['Les factures de cette personne sont conservées : elles constituent des pièces comptables que la loi impose de garder.'] : [], 'done' => true];
  }
}
