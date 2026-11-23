<?php
if (!defined('ABSPATH')) exit;

/** Une ligne par (commande, type de relance) au maximum : la contrainte UNIQUE protège contre un double envoi
 *  même si deux exécutions du cron se chevauchent. Conservé 180 jours. */
final class CVR_DB {
  const VER = '1';
  const RETAIN_DAYS = 180;
  public static function table() { global $wpdb; return $wpdb->prefix . 'cvr_sent'; }

  public static function install() {
    global $wpdb; require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    $t = self::table(); $cs = $wpdb->get_charset_collate();
    dbDelta("CREATE TABLE $t (
      id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
      created_at datetime NOT NULL,
      order_id bigint(20) unsigned NOT NULL DEFAULT 0,
      kind varchar(24) NOT NULL DEFAULT '',
      status varchar(10) NOT NULL DEFAULT '',
      reason varchar(30) NOT NULL DEFAULT '',
      PRIMARY KEY  (id),
      UNIQUE KEY ok (order_id, kind),
      KEY created_at (created_at)
    ) $cs;");
    update_option('cvr_db_version', self::VER, false);
  }
  public static function maybe_upgrade() { if (get_option('cvr_db_version') !== self::VER) self::install(); }

  public static function already_attempted($order_id, $kind) {
    global $wpdb; return (bool) $wpdb->get_var($wpdb->prepare('SELECT 1 FROM ' . self::table() . ' WHERE order_id=%d AND kind=%s', (int) $order_id, $kind));
  }
  /** Tente d'enregistrer la tentative ; false si déjà tentée (course entre deux exécutions du cron). */
  public static function claim($order_id, $kind, $status, $reason = '') {
    global $wpdb;
    $ins = $wpdb->insert(self::table(), ['created_at' => gmdate('Y-m-d H:i:s'), 'order_id' => (int) $order_id, 'kind' => $kind, 'status' => substr($status, 0, 10), 'reason' => substr($reason, 0, 30)], ['%s', '%d', '%s', '%s', '%s']);
    return $ins !== false;
  }

  public static function stats() {
    global $wpdb; $t = self::table(); $week = gmdate('Y-m-d H:i:s', time() - 7 * DAY_IN_SECONDS);
    $r = $wpdb->get_row($wpdb->prepare("SELECT COALESCE(SUM(CASE WHEN status='sent' AND created_at>=%s THEN 1 END),0) sent_7d, COALESCE(SUM(CASE WHEN status!='sent' AND created_at>=%s THEN 1 END),0) skipped_7d FROM $t", $week, $week));
    return ['sent_7d' => (int) ($r->sent_7d ?? 0), 'skipped_7d' => (int) ($r->skipped_7d ?? 0)];
  }
  public static function recent($page = 1, $per = 30) {
    global $wpdb; $t = self::table();
    $rows = $wpdb->get_results($wpdb->prepare("SELECT * FROM $t ORDER BY id DESC LIMIT %d OFFSET %d", (int) $per, max(0, ((int) $page - 1) * (int) $per)));
    return ['rows' => $rows, 'total' => (int) $wpdb->get_var("SELECT COUNT(*) FROM $t")];
  }
  public static function prune() { global $wpdb; $wpdb->query($wpdb->prepare('DELETE FROM ' . self::table() . ' WHERE created_at < %s', gmdate('Y-m-d H:i:s', time() - self::RETAIN_DAYS * DAY_IN_SECONDS))); }
}
