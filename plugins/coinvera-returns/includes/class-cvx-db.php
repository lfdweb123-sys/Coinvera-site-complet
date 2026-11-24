<?php
if (!defined('ABSPATH')) exit;

final class CVX_DB {
  const VER = '1';
  public static function table() { global $wpdb; return $wpdb->prefix . 'cvx_requests'; }

  public static function install() {
    global $wpdb; require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    $t = self::table(); $cs = $wpdb->get_charset_collate();
    dbDelta("CREATE TABLE $t (
      id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
      created_at datetime NOT NULL,
      updated_at datetime NOT NULL,
      order_id bigint(20) unsigned NOT NULL,
      customer_id bigint(20) unsigned NOT NULL DEFAULT 0,
      type varchar(16) NOT NULL DEFAULT '',
      status varchar(16) NOT NULL DEFAULT 'pending',
      reason varchar(24) NOT NULL DEFAULT '',
      note text NULL,
      items longtext NULL,
      amount decimal(18,2) NOT NULL DEFAULT 0,
      coupon_code varchar(40) NOT NULL DEFAULT '',
      admin_note text NULL,
      PRIMARY KEY  (id),
      KEY order_id (order_id),
      KEY status (status)
    ) $cs;");
    update_option('cvx_db_version', self::VER, false);
  }
  public static function maybe_upgrade() { if (get_option('cvx_db_version') !== self::VER) self::install(); }

  public static function insert(array $d) {
    global $wpdb; $now = gmdate('Y-m-d H:i:s');
    $wpdb->insert(self::table(), array_merge(['created_at' => $now, 'updated_at' => $now], $d),
      ['%s', '%s', '%d', '%d', '%s', '%s', '%s', '%s', '%s', '%f', '%s', '%s']);
    return (int) $wpdb->insert_id;
  }
  public static function update($id, array $d) { global $wpdb; $wpdb->update(self::table(), array_merge($d, ['updated_at' => gmdate('Y-m-d H:i:s')]), ['id' => (int) $id]); }
  public static function get($id) { global $wpdb; return $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . self::table() . ' WHERE id=%d', (int) $id)); }

  /** Quantité déjà demandée (hors demandes rejetées) pour un article d'une commande : empêche de réclamer plus que ce qui a été acheté. */
  public static function already_requested_qty($order_id, $item_id) {
    $qty = 0;
    foreach (self::for_order($order_id) as $r) {
      if ($r->status === 'rejected') continue;
      foreach (json_decode((string) $r->items, true) ?: [] as $it) if ((int) ($it['item_id'] ?? 0) === (int) $item_id) $qty += (int) ($it['qty'] ?? 0);
    }
    return $qty;
  }
  public static function for_order($order_id) { global $wpdb; return $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . self::table() . ' WHERE order_id=%d ORDER BY id DESC', (int) $order_id)); }
  public static function for_customer($customer_id) { global $wpdb; return $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . self::table() . ' WHERE customer_id=%d ORDER BY id DESC', (int) $customer_id)); }

  public static function recent($page = 1, $per = 30, $status = '') {
    global $wpdb; $t = self::table(); $where = '1=1'; $args = [];
    if ($status !== '') { $where = 'status=%s'; $args[] = $status; }
    $count = $args ? $wpdb->prepare("SELECT COUNT(*) FROM $t WHERE $where", $args) : "SELECT COUNT(*) FROM $t";
    $rows = $wpdb->get_results($wpdb->prepare("SELECT * FROM $t WHERE $where ORDER BY id DESC LIMIT %d OFFSET %d", array_merge($args, [(int) $per, max(0, ((int) $page - 1) * (int) $per)])));
    return ['rows' => $rows, 'total' => (int) $wpdb->get_var($count)];
  }
  public static function counts() { global $wpdb; $t = self::table(); return $wpdb->get_results("SELECT status, COUNT(*) n FROM $t GROUP BY status", OBJECT_K); }
}
