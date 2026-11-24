<?php
if (!defined('ABSPATH')) exit;

/** Deux tables : le journal des confirmations (conservé 180 jours) et les compteurs de fiabilité, indexés par un
 *  identifiant HACHÉ (téléphone / e-mail) — jamais le numéro ni l'adresse en clair. Compteurs conservés 24 mois
 *  après la dernière activité. */
final class CVC_DB {
  const VER = '1';
  const LOG_DAYS = 180;
  const SCORE_DAYS = 730;
  public static function log_table() { global $wpdb; return $wpdb->prefix . 'cvc_log'; }
  public static function cust_table() { global $wpdb; return $wpdb->prefix . 'cvc_customers'; }

  public static function install() {
    global $wpdb; require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    $l = self::log_table(); $c = self::cust_table(); $cs = $wpdb->get_charset_collate();
    dbDelta("CREATE TABLE $l (
      id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
      created_at datetime NOT NULL,
      order_id bigint(20) unsigned NOT NULL DEFAULT 0,
      event varchar(24) NOT NULL DEFAULT '',
      status varchar(10) NOT NULL DEFAULT '',
      reason varchar(30) NOT NULL DEFAULT '',
      PRIMARY KEY  (id),
      KEY created_at (created_at),
      KEY order_id (order_id)
    ) $cs;");
    dbDelta("CREATE TABLE $c (
      ident char(64) NOT NULL,
      delivered int(10) unsigned NOT NULL DEFAULT 0,
      refused int(10) unsigned NOT NULL DEFAULT 0,
      unconfirmed int(10) unsigned NOT NULL DEFAULT 0,
      updated_at datetime NOT NULL,
      PRIMARY KEY  (ident),
      KEY updated_at (updated_at)
    ) $cs;");
    update_option('cvc_db_version', self::VER, false);
  }
  public static function maybe_upgrade() { if (get_option('cvc_db_version') !== self::VER) self::install(); }

  // ---------- Journal ----------
  public static function log($order_id, $event, $status, $reason = '') {
    global $wpdb;
    $wpdb->insert(self::log_table(), ['created_at' => gmdate('Y-m-d H:i:s'), 'order_id' => (int) $order_id, 'event' => substr($event, 0, 24), 'status' => substr($status, 0, 10), 'reason' => substr($reason, 0, 30)], ['%s', '%d', '%s', '%s', '%s']);
  }
  public static function recent($page = 1, $per = 30) {
    global $wpdb; $t = self::log_table();
    $rows = $wpdb->get_results($wpdb->prepare("SELECT * FROM $t ORDER BY id DESC LIMIT %d OFFSET %d", (int) $per, max(0, ((int) $page - 1) * (int) $per)));
    return ['rows' => $rows, 'total' => (int) $wpdb->get_var("SELECT COUNT(*) FROM $t")];
  }
  public static function stats() {
    global $wpdb; $t = self::log_table(); $week = gmdate('Y-m-d H:i:s', time() - 7 * DAY_IN_SECONDS);
    $r = $wpdb->get_row($wpdb->prepare("SELECT COALESCE(SUM(CASE WHEN event='confirmed' THEN 1 END),0) confirmed, COALESCE(SUM(CASE WHEN event IN ('declined','expired') THEN 1 END),0) lost, COALESCE(SUM(CASE WHEN event='score_block' THEN 1 END),0) blocked FROM $t WHERE created_at>=%s", $week));
    return ['confirmed' => (int) ($r->confirmed ?? 0), 'lost' => (int) ($r->lost ?? 0), 'blocked' => (int) ($r->blocked ?? 0)];
  }

  // ---------- Fiabilité ----------
  public static function counts($ident) {
    global $wpdb; return $wpdb->get_row($wpdb->prepare('SELECT delivered, refused, unconfirmed FROM ' . self::cust_table() . ' WHERE ident=%s', $ident));
  }
  /** $col : 'delivered' | 'refused' | 'unconfirmed' (liste blanche : jamais une valeur venue de l'extérieur). */
  public static function bump($ident, $col) {
    if (!in_array($col, ['delivered', 'refused', 'unconfirmed'], true)) return;
    global $wpdb; $t = self::cust_table(); $now = gmdate('Y-m-d H:i:s');
    $wpdb->query($wpdb->prepare("INSERT INTO $t (ident, $col, updated_at) VALUES (%s, 1, %s) ON DUPLICATE KEY UPDATE $col = $col + 1, updated_at = %s", $ident, $now, $now));
  }
  public static function prune() {
    global $wpdb;
    $wpdb->query($wpdb->prepare('DELETE FROM ' . self::log_table() . ' WHERE created_at < %s', gmdate('Y-m-d H:i:s', time() - self::LOG_DAYS * DAY_IN_SECONDS)));
    $wpdb->query($wpdb->prepare('DELETE FROM ' . self::cust_table() . ' WHERE updated_at < %s', gmdate('Y-m-d H:i:s', time() - self::SCORE_DAYS * DAY_IN_SECONDS)));
  }
}
