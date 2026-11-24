<?php
if (!defined('ABSPATH')) exit;

final class CVX_Privacy {
  public static function init() {
    add_filter('wp_privacy_personal_data_exporters', function ($e) { $e['coinvera-returns'] = ['exporter_friendly_name' => 'Coinvera Returns', 'callback' => [__CLASS__, 'export']]; return $e; });
    add_filter('wp_privacy_personal_data_erasers', function ($e) { $e['coinvera-returns'] = ['eraser_friendly_name' => 'Coinvera Returns', 'callback' => [__CLASS__, 'erase']]; return $e; });
    add_action('admin_init', function () {
      if (function_exists('wp_add_privacy_policy_content'))
        wp_add_privacy_policy_content('Coinvera Returns', wp_kses_post('<p>Si vous demandez un retour ou un échange, nous conservons la commande concernée, les articles sélectionnés, la raison indiquée et vos éventuelles précisions, ainsi que le code du bon d’achat le cas échéant. Ces informations sont utilisées uniquement pour traiter votre demande et conservées à des fins comptables.</p>'));
    });
  }
  private static function user_id_for($email) { $u = get_user_by('email', sanitize_email($email)); return $u ? (int) $u->ID : 0; }

  public static function export($email, $page = 1) {
    $uid = self::user_id_for($email); if (!$uid) return ['data' => [], 'done' => true];
    $items = [];
    foreach (CVX_DB::for_customer($uid) as $r) $items[] = ['group_id' => 'cvx-returns', 'group_label' => 'Coinvera Returns', 'item_id' => 'cvx-' . $r->id, 'data' => [
      ['name' => 'Date', 'value' => $r->created_at], ['name' => 'Commande', 'value' => '#' . $r->order_id], ['name' => 'Type', 'value' => $r->type],
      ['name' => 'Statut', 'value' => $r->status], ['name' => 'Raison', 'value' => $r->reason], ['name' => 'Précisions', 'value' => $r->note]]];
    return ['data' => $items, 'done' => true];
  }
  /** La commande, le type et le statut sont conservés à des fins comptables ; seules les précisions libres saisies
   *  par le client (pouvant contenir des informations personnelles non nécessaires à la tenue des comptes) sont effacées. */
  public static function erase($email, $page = 1) {
    $uid = self::user_id_for($email); if (!$uid) return ['items_removed' => false, 'items_retained' => false, 'messages' => [], 'done' => true];
    global $wpdb; $n = (int) $wpdb->query($wpdb->prepare('UPDATE ' . CVX_DB::table() . " SET note = '' WHERE customer_id = %d AND note <> ''", $uid));
    return ['items_removed' => $n > 0, 'items_retained' => $n > 0, 'messages' => $n > 0 ? ['Les demandes de retour sont conservées à des fins comptables ; vos précisions libres ont été supprimées.'] : [], 'done' => true];
  }
}
